'use strict';
/* Filters */
angular.module('myApp.filters', []).filter('iif', function() {
    return function(input, trueValue, falseValue) {
        return input ? trueValue : falseValue;
    };
});
