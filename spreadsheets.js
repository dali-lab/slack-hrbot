// promisifyed spreadsheets
var GoogleSpreadsheet = require("google-spreadsheet");
var moment = require('moment');
// var google_creds = {
//   client_email: process.env.CLIENT_EMAIL,
//   private_key: process.env.PRIVATE_KEY
// }
var spreadsheet = new GoogleSpreadsheet('1eR_YVageutlLK03ZKeLeKL82eZE-ksSO-PS4ppJFjp8');
var google_creds = require('./dalilab-hrbot-8d7a1f0c4199.json');
var _ = require('underscore');



var Spreadsheets = {

  getAuth: function() {
    return new Promise(function(fulfill, reject) {
      spreadsheet.useServiceAccountAuth(google_creds, function(err) {
        if (err) {
          reject(err);
        } else {
          fulfill();
        }
      });
    });
  },

  getSpreadSheet: function(spreadsheetName) {
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
    var self = this;
    return this.getAuth()
    .then(function(){
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
              if (now.isBetween(s, e)) {
                config.currentTerm = rows[i].term;
                config.currentWeek = now.diff(s, 'weeks');
                console.log("currentWeek: " + config.currentWeek + ", currentTerm: " + config.currentTerm);
              }
            }
            fulfill(config);
          }
        });
      });
    });
  },

  addRowToSheet: function(data, sheet) {
    return new Promise(function(fulfill, reject) {
      console.log('adding row');
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

  getRowByUsername: function(sheet, username) {
    return new Promise(function(fulfill, reject) {
      sheet.getRows(function(err, rows) {
        if (err) {
          reject(err);
        } else {
          var row = _.find(rows, function(r){ return r.username == username; });
          if (row) {
            fulfill(row);
          } else {
            reject(new Error('no row found with username: %s', username));
          }
        }
      })
    });
  },

  logUncaught: function(username, msg) {
    var self = this;
    this.getSpreadSheet('uncaught').then(function(sheet) {
      return self.addRowToSheet( { 'username': username, 'date': moment().format("dddd, MMMM Do YYYY, h:mm:ss a"), 'message': msg}, sheet);
    }).catch(function(err){
      console.log("logging failed: %s", err);
    });
  },

  updateWeekHours: function(username, hours, week, term) {
    var self = this;
    this.getSpreadSheet(term).then(function(sheet) {
      return self.getRowByUsername(sheet, username);
    }).then(function(row) {
      row[weekFormat(week)] = hours;
      return saveRow(row);
    }).catch(function(err) {
      console.log(err);
    });

  },

  lastWeekWorked: function(username, term) {
    var self = this;
    this.getSpreadSheet(term).then(function(sheet) {
      return self.getRowByUsername(sheet, username);
    }).then(function(row) {
      var weeks = weekKeys();
      var i = weeks.length-1;
      while (i >= 0 && row[weeks[i]] == '' ) {
        i--;
      }
      console.log('last week filed: %s, for hrs: %s', weeks[i], row[weeks[i]]);
    });
  },

  test: function() {
      this.updateWeekHours('tim', 12, 4, '15x');


    // spreadsheet.useServiceAccountAuth(google_creds, function(err) {
    //   // getInfo returns info about the sheet and an array or "worksheet" objects
    //   spreadsheet.getInfo(function(err, sheet_info) {
    //     console.log(sheet_info.title + ' is loaded');
    //     // use worksheet object if you want to stop using the # in your calls
    //     console.log(sheet_info.worksheets);
    //     var sheet1 = sheet_info.worksheets[0];
    //     console.log(sheet1.colCount);
    //     sheet1.getRows(function(err, rows) {
    //       console.log(Object.keys(rows[0]));
    //     });
    //     // var sheet1 = sheet_info.worksheets[0];
    //     // sheet1.getRows( function( err, rows ){
    //     //     rows[0].colname = 'new val';
    //     //     rows[0].save(); //async and takes a callback
    //     //     rows[0].del();  //async and takes a callback
    //     // });
    //   });
    //
    //   // // column names are set by google and are based
    //   // // on the header row (first row) of your sheet
    //   // spreadsheet.addRow( 2, { colname: 'col value'} );
    //   //
    //   // spreadsheet.getRows( 2, {
    //   //     start: 100,          // start index
    //   //     num: 100,              // number of rows to pull
    //   //     orderby: 'name'  // column to order results by
    //   // }, function(err, row_data){
    //   //     // do something...
    //   // });
    // })

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
  return "week"+week;
}

var weekKeys = function() {
  var r = [];
  for (var i = 0; i < 20; i++) {
    r.push(weekFormat(i));
  }
  return r;
}


module.exports = Spreadsheets;
