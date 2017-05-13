var express = require('express');
var bodyParser = require('body-parser');
var db = require('../database/index.js');
var request = require('request');
var pgp = require('pg-promise')();
let path = require('path');
var cookieParser = require('cookie-parser');
var utils = require('./lib/inventoryUtils.js');

let app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(__dirname + '/../client/dist'));

// routes
let routeHandlers = require('./lib/route-handlers');
let authRoutes = require('./lib/auth.js');
app.use('/auth', authRoutes);

app.post('/inventory', (req, res) => {
  db.query('SELECT houses_items.id AS id, houses_items.need_to_restock AS needToRestock, houses_items.notes AS notes, users.username AS username, items.itemname AS name FROM houses_items LEFT JOIN users ON houses_items.user_id = users.id LEFT JOIN items ON houses_items.item_id = items.id WHERE houses_items.house_id = ${houseId#};',
    { houseId: req.body.houseId })
    .then(data => {
      console.log(`Successful HOUSES_ITEMS table query for houseId = ${req.body.houseId}`);
      res.send(data);
    })
    .catch(err => console.log(`Bad HOUSES_ITEMS table query for houseId = ${req.body.houseId}: `, err));
});

app.post('/restock', (req, res) => {
  db.query('UPDATE houses_items SET need_to_restock = TRUE WHERE id = ${itemId#}',
    { itemId: req.body.itemId })
    .then(() => {
      console.log(`Item, item_id = ${req.body.itemId}, successfully updated to need_to_restock = TRUE in HOUSES_ITEMS table`);
      res.sendStatus(201);
    })
    .catch(err => console.log(`Item, item_id = ${req.body.itemId}, need_to_restock value unable to be updated in HOUSES_ITEMS: `, err));
});

app.post('/claim', (req, res) => {
  db.query('UPDATE houses_items SET user_id = ${userId#} WHERE id = ${itemId#}',
    { itemId: req.body.itemId, userId: req.body.userId })
    .then(() => {
      console.log(`Item, item_id = ${req.body.itemId}, successfully updated to user_id = ${req.body.userId} in HOUSES_ITEMS table`);
    })
    .catch(err => console.log(`Unable to update item, item_id = ${req.body.itemId}, to user_id = ${req.body.userId} in HOUSES_ITEMS: `, err));

  db.query('INSERT INTO users_house_items (user_id, houses_items_id) VALUES (${userId#}, ${itemId#})',
    { itemId: req.body.itemId, userId: req.body.userId })
    .then(() => {
      console.log(`Item, item_id = ${req.body.itemId}, and user, user_id = ${req.body.userId}, successfully inserted item into USERS_HOUSE_ITEMS table`);
    })
    .catch(err => console.log(`Item, item_id = ${req.body.itemId}, and user, user_id = ${req.body.userId}, unable to be inserted in USERS_HOUSE_ITEMS: `, err));

  db.query('SELECT username FROM users WHERE id = ${userId#}',
    { userId: req.body.userId })
  .then(data => {
    console.log(`Successful USERS table query for username with user_id = ${req.body.userId}`);
    res.send(data[0]);
  })
  .catch(err => console.log(`Unable to retrieve username from USERS table for user_id = ${req.body.userId}: `, err));
});

app.post('/delete', (req, res) => {
  db.query('DELETE FROM houses_items WHERE id = ${itemId#}',
    { itemId: req.body.itemId })
    .then(() => {
      console.log(`Item, item_id = ${req.body.itemId}, successfully deleted from HOUSES_ITEMS table`);
      res.sendStatus(201);
    })
    .catch(err => console.log(`Item, item_id = ${req.body.itemId}, unable to be removed from HOUSES_ITEMS: `, err));
});

app.post('/createUser', function(req, res) {
  db.query('SELECT * FROM users WHERE username=${userName} and house_id=${houseId#}', { userName: req.body.userName, houseId: req.body.houseId })
    .then((data)=>{
      if (data.length === 0) {
        console.log('shouldnt show up if array has stuff');
        db.query('INSERT INTO users (username, house_id) VALUES (${userName}, ${houseId#})', { userName: req.body.userName, houseId: req.body.houseId } )
          .then(() => {
            res.send('Successfully created user');
          })
          .catch (err => console.log('unable to create user', err));
      } else {

        res.send('Username already taken');
      }
    })
    .catch (err => console.log('unable '));
});

app.post('/settingCooks', function(req, res) {
  console.log('shooott...', req.body.userId);
  db.query('SELECT * FROM users WHERE id=${userId#}', { userId: req.body.userId})
    .then((data)=>{
      res.clearCookie('userId');
      res.cookie('userId', data[0].id);
      res.send('successful cookie passing');
    })
    .catch(err => console.log('unable to set cookies', err));
});

app.post('/cookUser', function(req, res) {
  db.query('SELECT * FROM users WHERE username=${userName}', { userName: req.body.userName })
  .then( (data)=> {
    res.clearCookie('userId');
    res.cookie('userId', data[0].id);
    res.send(201);
  })
  .catch( err=> console.log('unable to pass cookies', err));
});

app.post('/users', function(req, res) {
  db.query('SELECT * FROM users WHERE house_id=${houseId#}', { houseId: req.body.houseId })
    .then( (data)=> {
      console.log('getting all users from this house', data);
      res.send(data);
    })
    .catch(err => console.log('unable to get users', err));
});

app.post('/add', (req, res) => {

  console.log('Adding item to inventory... ');

  var validate = utils.validateAddItemForm(req.body);

  if (!validate.success) {
    console.log('validate: ', validate.errors);
    return res.status(400).json(validate.errors);
  }

  db.query('SELECT id FROM items WHERE itemname = ${name}', { name: req.body.name })
    .then(body => {
      console.log(`Successful query of ITEMS table for ${req.body.name}`);
      if (body.length > 0) {
        db.query('INSERT INTO houses_items (house_id, item_id, need_to_restock, notes) VALUES (${houseId#}, ${itemId#}, ${needToRestock^}, ${notes})',
          { houseId: req.body.houseId, itemId: body[0].id, needToRestock: false, notes: req.body.notes })
          .then(() => {
            console.log(`Successful insert into HOUSES_ITEMS table: {houseId: ${req.body.houseId}, itemId: ${body[0].id}, needToRestock: false, notes: ${req.body.notes}}`);
            res.sendStatus(201);
          })
          .catch(err => console.log(`Unable to add item to HOUSES_ITEMS table: {houseId: ${req.body.houseId}, itemId: ${body[0].id}, needToRestock: false, notes: ${req.body.notes}} `, err));
        return;
      }
      db.query('INSERT INTO items (itemname) VALUES (${name})', { name: req.body.name })
        .then(() => {
          console.log(`Successfully inserted ${req.body.name} into ITEMS table`);
          db.query('SELECT id FROM items WHERE itemname = ${name}', { name: req.body.name })
          .then(body => {
            console.log(`Successful retrieve of item id = ${body[0].id} for itemname = ${req.body.name} from ITEMS`);
            db.query('INSERT INTO houses_items (house_id, item_id, need_to_restock, notes) VALUES (${houseId#}, ${itemId#}, ${needToRestock^}, ${notes})',
              { houseId: req.body.houseId, itemId: body[0].id, needToRestock: false, notes: req.body.notes })
              .then(() => {
                console.log(`Successful insert into HOUSES_ITEMS: {houseId: ${req.body.houseId}, itemId: ${body[0].id}, needToRestock: false, notes: ${req.body.notes}}`);
                res.sendStatus(201);
              })
              .catch(err => console.log(`Unable to add to HOUSES_ITEMS table: {houseId: ${req.body.houseId}, itemId: ${body[0].id}, needToRestock: false, notes: ${req.body.notes}} `, err));
          })
          .catch(err => console.log(`Error retrieving the item id = ${body[0].id} for itemname = ${req.body.name} from ITEMS: `, err));
        })
        .catch(err => console.log(`Error inserting ${req.body.name} into ITEMS: `, err));
      return;
    })
    .catch(err => console.log(`Error querying ITEMS table for ${req.body.name}: `, err));
});

app.get('/api/shop', routeHandlers.getShoppingList);
app.post('/api/shop', routeHandlers.updateWithPurchases);

app.get('*', function(req, res) {
  res.sendFile(path.resolve(__dirname + '/../client/dist/index.html'));
});

app.listen(process.env.PORT || 1337, function() {
  console.log('Listening on 1337...');
});
