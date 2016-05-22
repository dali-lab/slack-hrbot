// user database using mongo to persist user access so we know
// who users are / when they were last contacted etc
// @author tim tregubov, 2016



var mongoose = require ("mongoose");
require('mongoose-moment')(mongoose);

var uristring = process.env.MONGOLAB_URI;
mongoose.connect(uristring, function (err, res) {
  if (err) {
    console.log ('ERROR connecting to: ' + uristring + '. ' + err);
  } else {
    console.log ('Succeeded connected to: ' + uristring);
  }
});

//construct user schema for mongoose
var userSchema = new mongoose.Schema({
  name: String,
  lastcontact: 'Moment',
  confirmed: false,
  amount: 0,
  lastWeekWorked: 0
});
// and the compiled model
var userModel = mongoose.model('User', userSchema);


// the user module
var User = {

  // adds and or inserts a new user
  // field: {lastcontact: lastcontact, confirmed: confirmed, amount: amount}
  updateAddUser: function(name, fields) {
    console.log("updateAddUser");
    return new Promise(function(fulfill, reject) {
      userModel.update({name: name},
        fields,
        {upsert: true, setDefaultsOnInsert: true},
        function (err, numAffected) {
          if (err) {
            console.log("Error during updateAddUser: " + err);
            reject(err);
          } else {
            fulfill();
          }
        });
    });
  },

  //finds user from mongo by name
  getUser: function(name) {
    return new Promise(function(fulfill, reject) {
      userModel.find({ name: name }, function (err, results) {
        if (err) {
          reject(err);
        } else {
          fulfill(results);
        }
      });
    });

  },

  // gets all users and returns a dictionary by username
  getAll: function() {
    return new Promise(function(fulfill, reject) {
      userModel.find(function (err, results) {
        if (err) {
          reject(err);
        } else {
          dict = {};
          results.forEach(function(user){
            dict[user.name] = user;
          });
          fulfill(dict);
        }
      });
    });

  }



};



module.exports = User;
