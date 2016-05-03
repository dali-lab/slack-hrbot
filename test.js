var userDB = require('./user');
userDB.getAll().then(function(allusers) {
  console.log(allusers);
});
