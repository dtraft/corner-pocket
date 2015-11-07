var gulp = require('gulp');
var gutil = require('gulp-util');
var prettify = require('gulp-jsbeautifier');

var argv = require('yargs').argv;

gulp.task('format', function() {
  gulp.src('./_attachments/js/*.js')
    .pipe(prettify({config: '.jsbeautifyrc'}))
    .pipe(gulp.dest('./_attachments/js'))
});

gulp.task('create-icon-list', function(){
    gulp.src('./_attachments/bower_components/ionicons/manifest.json')
    .pipe({
        on:function(){
            console.log(arguments);
        }
    });
    
});

gulp.task('add-user', function(cb){
  var cradle = require('cradle');
  var crypto = require('crypto');

  cradle.setup({
    host: 'onsitedatacollection.cloudant.com',
    port: 80,
    cache: false,
    timeout: 5000
  })

  var conn = new (cradle.Connection)({
    secure: false,
    auth: { username: "onsitedatacollection", password: "RedSox12" }
  })

  var db = conn.database('_users')

  function createUser(name, password, callback){
    db.get(name, function (err, doc) {
      if(err && err.error === 'not_found'){
        var hashAndSalt = generatePasswordHash(password)
        db.save("org.couchdb.user:" + name, {
          name: name,
          password_sha: hashAndSalt[0],
          salt: hashAndSalt[1],
          password_scheme: 'simple',
          type: 'user'
        }, callback)
      } else if(err) {
        callback(err)
      } else {
        callback({error: 'user_exists'})
      }
    })
  }

  function generatePasswordHash(password){
    var salt = crypto.randomBytes(16).toString('hex');
    var hash = crypto.createHash('sha1');
    hash.update(password + salt);
    return [hash.digest('hex'), salt];
  }

  createUser(argv.name, argv.pass, function(err){
    if(!err){
      console.log("User created!");
    }else{
      console.log(err);
    }
    cb();
  });
});