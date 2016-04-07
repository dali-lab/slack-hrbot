// promisifyed spreadsheets js for use with hr slackbot
// @author tim tregubov, 2016
// note:  there are newer spreadsheet access api's that might be better than this
//        this one needed work to wrap up in promises,  could also maybe do this with bluebird

var GoogleSpreadsheet = require("google-spreadsheet");
var moment = require('moment');
var moment = require('moment-timezone');
moment.tz.setDefault("America/New_York");

var google_creds = {
   "client_email": process.env.CLIENT_EMAIL,
   "private_key": process.env.PRIVATE_KEY,
   "client_id": process.env.CLIENT_ID,
   "private_key_id": process.env.PRIVATE_KEY_ID,
   "type": process.env.TYPE
 }
var spreadsheet = new GoogleSpreadsheet(process.env.SPREADSHEET);
//var google_creds = require('./dalilab-hrbot-8d7a1f0c4199.json');
var _ = require('underscore');

var Spreadsheets = {

  // authorizes and signs in google account app credentials
  getAuth: function() {
    return new Promise(function(fulfill, reject) {
      console.log("getAuth");
      spreadsheet.useServiceAccountAuth(google_creds, function(err) {
        if (err) {
          reject(err);
        } else {
          fulfill();
        }
      });
    });
  },

  //gets specific sheet from spreadsheet
  getSpreadSheet: function(spreadsheetName) {
    console.log("getSpreadSheet: " + spreadsheetName);
    return new Promise(function(fulfill, reject) {
      spreadsheet.getInfo(function(err, sheet_info) {
        if (err) {
          reject(err);
        } else {
          var sheet = sheet_info.worksheets.filter(function(worksheet) {
            return worksheet.title == spreadsheetName;
          })[0];

          if (sheet) {
            console.log('found sheet: ' + spreadsheetName);
            fulfill(sheet);
          } else {
            reject(new Error("couldn't find spreadsheet: " + spreadsheetName));
          }
        }
      });
    });
  },

  // this connects to the spreadsheet and gets the configs
  // which includes current term and dates for current term
  // wraps it in a promise
  getHRConfigs: function() {
    console.log("getHRConfigs");
    var self = this;
    return this.getAuth()
      .then(function() {
        return self.getSpreadSheet('CONFIGS');
      })
      .then(function(sheet) {
        return new Promise(function(fulfill, reject) {
          config = {}
          sheet.getRows(function(err, rows) {
            if (err) {
              reject(err);
            } else {
              for (var i in rows) {
                var now = moment();
                var s = moment(rows[i].start, "MM/DD/YYYY");
                var e = moment(rows[i].end, "MM/DD/YYYY");
                console.log('start of '+ rows[i].term +' term: '+s.format());
                console.log('end of '+ rows[i].term +' term: '+e.format());
                if (now.isBetween(s, e)) {
                  config.currentTerm = rows[i].term;
                  config.currentWeek = Math.ceil(now.diff(s, 'weeks', true));
                  console.log("currentTerm is " + config.currentTerm + "!, and currentWeek: " + config.currentWeek);
                  break;
                }
              }
              fulfill(config);
            }
          });
        });
      });
  },

  // adds a row to sheet specified,  fields must exist
  addRowToSheet: function(data, sheet) {
    console.log("addRowToSheet");
    return new Promise(function(fulfill, reject) {
      sheet.addRow(data, function(err, result) {
        if (err) {
          console.log('error: ' + err);
          reject(err);
        } else {
          fulfill(result);
        }
      });
    });
  },

  // get all weeks for a user
  getAllForUser: function(term, username) {
    var self = this;
    var spreadsheet;
    var allweeks="";
    return this.getSpreadSheet(term).then(function(sheet) {
      spreadsheet = sheet;
      return self.getRowByUsername(sheet, username);
    }).then(function(row) {
      var weeks = weekKeys();

      for (var i =0; i < weeks.length; i++) {
        if (row[weeks[i]]) {
          allweeks += "week " + i + ": " + row[weeks[i]] + ", ";
        }
      }

      return allweeks.slice(0, -2);
    });
  },

  // returns a row by the username from the sheet by the username field
  getRowByUsername: function(sheet, username) {
    console.log("getRowByUsername: " + username);
    return new Promise(function(fulfill, reject) {
      console.log(JSON.stringify(sheet));
      sheet.getRows(function(err, rows) {
        if (err) {
          reject(err);
        } else {
          console.log("rows: " + rows + ',' + rows.count);
          var row = _.find(rows, function(r) {
            return r.username == username;
          });
          if (row) {
            console.log("found " + username + " at row " + row);
            fulfill(row);
          } else {
            reject(new Error('no row found with username ' + username));
          }
        }
      })
    });
  },

  //special to log any messages into an uncaught sheet for record keeping
  logUncaught: function(username, msg) {
    var self = this;
    this.getSpreadSheet('uncaught').then(function(sheet) {
      return self.addRowToSheet({
        'username': username,
        'date': moment().format("dddd, MMMM Do YYYY, h:mm:ss a"),
        'message': msg
      }, sheet);
    }).catch(function(err) {
      console.log("logging failed: %s", err);
    });
  },

  // update the week hours for a user or inserts new
  updateWeekHours: function(username, hours, week, term) {
    var self = this;
    var spreadsheet;
    this.getSpreadSheet(term).then(function(sheet) {
      spreadsheet = sheet;
      return self.getRowByUsername(spreadsheet, username);
    }).catch(function(err) {
      // if the user isn't in the spreadsheet yet need to add first
      return self.addRowToSheet({'username': username},spreadsheet)
        .then(function(){
          // retry getting the row by username
          return self.getRowByUsername(spreadsheet, username);
        });
    }).then(function(row) {
      console.log('updateWeekHours username: %s, hours: %d, week: %d, term: %s', username, hours, week, term);
      // now we have row set the weeks
      row[weekFormat(week)] = hours;
      return saveRow(row);
    }).catch(function(err) {
      var msg = 'updateWeekHours error: ' + err;
      console.log(msg);
      self.logUncaught(username, msg)
    });

  },

  // gets the last week that a user had input hours for
  lastWeekWorked: function(username, term) {
    var self = this;
    this.getSpreadSheet(term).then(function(sheet) {
      return self.getRowByUsername(sheet, username);
    }).then(function(row) {
      var weeks = weekKeys();
      var i = weeks.length - 1;
      while (i >= 0 && row[weeks[i]] == '') {
        i--;
      }
      console.log('last week filed: %s, for hrs: %s', weeks[i], row[weeks[i]]);
    });
    return i;
  },


  checkInUser: function(username, week, term) {
    var self = this;
    var spreadsheet;
    var name = term + "-check-in"
    this.getSpreadSheet(name).then(function(sheet) {
      spreadsheet = sheet;
      return self.getRowByUsername(spreadsheet, username);
    }).catch(function(err) {
      // if the user isn't in the spreadsheet yet need to add first
      console.log("user not in sheet- adding row");
      return self.addRowToSheet({'username': username},spreadsheet)
        .then(function(){
          // retry getting the row by username
          console.log("retrying getRowByUsername");
          return self.getRowByUsername(spreadsheet, username);
        });
    }).then(function(row) {
      console.log('check in user username: %s, term: %s', username, term);
      // now we have row set login
      row[weekFormat(week)] = 1;
      return saveRow(row);
    }).catch(function(err) {
      console.log(err);
      self.logUncaught(username, msg);
    });

  },


  test: function() {
    this.updateWeekHours('tim', 12, 4, '15x');
  },


}


// private methods and such:

var saveRow = function(row) {
  return new Promise(function(fulfill, reject) {
    row.save(function(err, result) {
      if (err) {
        reject(err);
      } else {
        fulfill(result);
      }
    })
  });
}

var weekFormat = function(week) {
  return "week" + week;
}

var weekKeys = function() {
  var r = [];
  for (var i = 0; i < 20; i++) {
    r.push(weekFormat(i));
  }
  return r;
}


module.exports = Spreadsheets;
