var gulp = require('gulp');
var gutil = require('gulp-util');
var prettify = require('gulp-jsbeautifier');
gulp.task('format', function() {
    gulp.src('./*.js').pipe(prettify({
        config: '.jsbeautifyrc'
    })).pipe(gulp.dest('.ˆ/js'))
});
