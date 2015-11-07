'use strict';
// Declare app level module which depends on filters, and services
angular.module('myApp', ['ngRoute', 
    'ngCookies', 
    'ngAnimate', 
    'myApp.filters', 
    'myApp.services', 
    'myApp.directives', 
    'myApp.controllers', 
    'ui.bootstrap', 
    'ui.sortable', 
    'ngDragDrop', 
    'ui.ace', 
    'corner-pocket', 
    'ngCookies', 
    'mgcrea.ngStrap.select', 
    'mgcrea.ngStrap.helpers.parseOptions', 
    'mgcrea.ngStrap.tooltip', 
    'mgcrea.ngStrap.typeahead',
    'ngSanitize', 
    'angularFileUpload'])
.config(['$routeProvider', '$httpProvider', '$locationProvider',
    function($routeProvider, $httpProvider, $locationProvider) {
        //GENERAL ROUTES f         
         
        $routeProvider.when('/', {
            templateUrl: 'partials/projects.html',
            controller: 'projectsController',
            access: 5,
            resolve: {
                check: function(routeAuth) {
                    return routeAuth.check();
                }
            }
        });
        $routeProvider.when('/login', {
            templateUrl: 'partials/login.html',
            controller: 'loginController'
        });
        $routeProvider.when('/activate/:userId/:groupId', {templateUrl: 'partials/login.html', controller: 'loginController'});
        $routeProvider.when('/home', {
            templateUrl: 'partials/home.html',
            controller: 'homeController',
            access: 5,
            resolve: {
                check: function(routeAuth) {
                    return routeAuth.check();
                }
            }
        });
        $routeProvider.when('/settings', {
            templateUrl: 'partials/settings.html',
            controller: 'settingsController',
            access: 5,
            resolve: {
                factory: 'routeAuth'
            }
        });
        //LIBRARY ROUTES
        $routeProvider.when('/libraries', {
            templateUrl: 'partials/libraries.html',
            controller: 'librariesController',
            access: 5,
            resolve: {
                check: function(routeAuth) {
                    return routeAuth.check();
                }
            }
        });
        $routeProvider.when('/libraries/:libraryId/components', {
            templateUrl: 'partials/libraryComponents.html',
            controller: 'libraryComponentsController',
            access: 5,
            resolve: {
                check: function(routeAuth) {
                    return routeAuth.check();
                }
            }
        });
        $routeProvider.when('/libraries/:libraryId/components/:componentId', {
            templateUrl: 'partials/libraryInputs.html',
            controller: 'libraryInputsController',
            access: 5,
            resolve: {
                check: function(routeAuth) {
                    return routeAuth.check();
                }
            }
        });
        $routeProvider.when('/libraries/:libraryId/lookuptables/:lookupTableId', {
            templateUrl: 'partials/libraryLookupTables.html',
            controller: 'libraryLookupTableController',
            access: 5,
            resolve: {
                check: function(routeAuth) {
                    return routeAuth.check();
                }
            }
        });
        //PROJECT ROUTES
        $routeProvider.when('/projects', {
            templateUrl: 'partials/projects.html',
            controller: 'projectsController',
            access: 5,
            resolve: {
                check: function(routeAuth) {
                    return routeAuth.check();
                }
            }
        });
        $routeProvider.when('/projects/:projectId', {
            templateUrl: 'partials/projectPage.html',
            controller: 'projectPageController',
            access: 5,
            resolve: {
                check: function(routeAuth) {
                    return routeAuth.check();
                }
            }
        });
        //TEMPLATE ROUTES
        $routeProvider.when('/templates', {
            templateUrl: 'partials/templates.html',
            controller: 'templatesController',
            access: 5,
            resolve: {
                check: function(routeAuth) {
                    return routeAuth.check();
                }
            }
        });
        $routeProvider.when('/templates/:templateId', {
            templateUrl: 'partials/templatePage.html',
            controller: 'templatePageController',
            access: 5,
            resolve: {
                check: function(routeAuth) {
                    return routeAuth.check();
                }
            }
        });
        //REPORT ROUTES
        $routeProvider.when('/reports', {
            templateUrl: 'partials/reports.html',
            controller: 'reportsController',
            access: 5,
            resolve: {
                check: function(routeAuth) {
                    return routeAuth.check();
                }
            }
        });
        $routeProvider.when('/reports/:reportId', {
            templateUrl: 'partials/reportPage.html',
            controller: 'reportPageController',
            access: 5,
            resolve: {
                check: function(routeAuth) {
                    return routeAuth.check();
                }
            }
        });
        //TOOLS ROUTES
        $routeProvider.when('/tools', {
            templateUrl: 'partials/tools.html',
            controller: 'toolsController',
            access: 5,
            resolve: {
                check: function(routeAuth) {
                    return routeAuth.check();
                }
            }
        });
        $routeProvider.otherwise({
            redirectTo: '/error'
        });
        //configure location
        $locationProvider.html5Mode(false);
        //configure http
        $httpProvider.defaults.withCredentials = true;
    }
]).run(function($rootScope, $location, $cookieStore, $user, $timeout) {}).config(['$compileProvider',
    function($compileProvider) {
        $compileProvider.aHrefSanitizationWhitelist(/^\s*(https?|ftp|mailto|data):/);
        // Angular before v1.2 uses $compileProvider.urlSanitizationWhitelist(...)
    }
]);
