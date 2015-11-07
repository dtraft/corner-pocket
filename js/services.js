'use strict';
/* Services */
// Demonstrate how to register services
// In this case it is a simple value service.
angular.module('myApp.services', []).factory('MHTMLDoc', function() {
    function MHTMLDoc() {
        this.boundary = '...BOUNDARY...';
        //begin configuring data on inialization.
        this.doc = 'MIME-Version: 1.0\nContent-Type: multipart/related; boundary="' + this.boundary + '"';
        this.addFile = function(path, contentType, data) {
            this.doc += "\n\n--" + this.boundary;
            this.doc += "\nContent-Location: file:///C:/" + path.replace(/!\\\!/g, "/");
            this.doc += "\nContent-Transfer-Encoding: base64"
            this.doc += "\nContent-Type: " + contentType + "\n\n";
            this.doc += data;
        };
        this.getDoc = function() {
            return this.doc + "\n\n--" + this.boundary + "--";
        };
    }
    return {
        new: function() {
            return new MHTMLDoc();
        }
    };
}).factory('$user', ['$rootScope', '$location', 'cornerPocket', '$http', '$q', '$cookieStore',
    function($rootScope, $location, cornerPocket, $http, $q, $cookieStore) {
        var couchdb = "https://onsitedatacollection.cloudant.com/";
        var user = {
            server: couchdb,
            load: function() {
                var deferred = $q.defer();
                var user = this;
                $http.get(couchdb + "_session").success(function(response) {
                    console.log(response);
                    //catch null names
                    if (!response.userCtx.name) {
                        user.logOut().then(function() {
                            console.log('null user name');
                            deferred.reject(response);
                        });
                    } else {
                        user.construct(response.userCtx);
                        deferred.resolve();
                    }
                }).error(function(data, status) {
                    deferred.reject(data);
                });
                return deferred.promise;
            },
            logIn: function(userInfo) {
                var deferred = $q.defer();
                var user = this;
                
                var payload = {
                  method: 'POST',
                  url: couchdb + "_session",
                  headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                  transformRequest: function(obj) {
                      var str = [];
                      for(var p in obj)
                      str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
                      return str.join("&");
                  },
                  data: userInfo
                }
                
                $http(payload).success(function(response) {
                    console.log(response);
                    user.construct(response);
                    console.log(user);
                    console.log("test");
                    deferred.resolve();
                }).error(function(data, status) {
                    $location.path("/login").replace();
                    deferred.reject();
                });
                return deferred.promise;
            },
            logOut: function() {
                var deferred = $q.defer();
                var user = this;
                if (cornerPocket.changes) {
                    cornerPocket.changes.cancel(); //stop listening, please!	
                }
                $http.delete(couchdb + "_session").success(function() {
                    //clean user object
                    delete user.activeGroup;
                    delete user.groups;
                    delete user.name;
                    user.loggedIn = false;
                    $.removeCookie('loggedIn');
                    $cookieStore.remove("group");
                    $location.path("/login").replace();
                    deferred.resolve();
                }).error(function(data, status) {
                    deferred.reject();
                });
                return deferred.promise;
            },
            setGroup: function(group) {
                if (user.activeGroup != group) {
                    user.activeGroup = group;
                    $cookieStore.put("group", user.activeGroup);
                    if (cornerPocket.changes) {
                        cornerPocket.changes.cancel(); //stop listening, please!	
                    }
                    cornerPocket.init(couchdb + group.name, {isRemote:false});
                    $location.path("/home").replace();
                }
            },
            construct: function(userCtx) {
                var user = this;
                user.name = userCtx.name;
                user.groups = [];
                var roles = userCtx.roles;
                for (var i = 0; i < roles.length; i++) {
                    //split into group and role
                    var info = roles[i].split("-");
                    //add to users groups
                    user.groups.push({
                        name: info[0],
                        role: info[1]
                    });
                }
                //on refresh, go back to the group we were in
                var group = $cookieStore.get("group");
                if (group) {
                    var active = _.findWhere(user.groups, {
                        name: group.name
                    });
                    user.activeGroup = active;
                } else {
                    user.activeGroup = user.groups[0];
                }
                $cookieStore.put("group", user.activeGroup);
                user.loggedIn = true;
                //set user to rootscope
                $rootScope.user = user;
                if (cornerPocket.changes) {
                    cornerPocket.changes.cancel(); //stop listening, please!	
                }
                //lastly, initialize the database
                cornerPocket.init(couchdb + user.activeGroup.name, {isRemote:false});
            }
        };
        return user;
    }
]).service('routeAuth', ['$q', '$user', '$timeout', '$location',
    function($q, $user, $timeout, $location) {
        return {
            check: function() {
                //immediately process if the user is already authenticated
                var deferred = $q.defer();
                console.log("waiting on route auth...");
                $timeout(function() {
                    console.log($user);
                    if ($user.loggedIn) {
                        console.log("logged in!");
                        deferred.resolve();
                    } else {
                        //else, try to authenticate, and wait to resolve until we know
                        console.log("...trying to load!");
                        $user.load().then(function() {
                            console.log('loaded')
                            deferred.resolve();
                        }, function() { //error
                            console.log('reject');
                            $location.path('/login').replace();
                            deferred.reject();
                        });
                    }
                });
                return deferred.promise;
            }
        };
    }
]).factory('generateReport', ['$q', '$rootScope', '$compile', '$parse', '$timeout', 'cornerPocket', 'MHTMLDoc',
    function($q, $rootScope, $compile, $parse, $timeout, cornerPocket, MHTMLDoc) {
        //trigger object, for later use
        function Trigger() {
            var self = this;
            self.components = [];
            self.SUM = function(property) {
                var result = 0;
                for (var i = 0; i < self.components.length; i++) {
                    var component = self.components[i];
                    if (component[property] && !isNaN(component[property])) {
                        result = result + parseFloat(component[property]);
                    }
                }
                return result;
            };
            self.AVERAGE = function(property) {
                var result = 0;
                var count = 0;
                for (var i = 0; i < self.components.length; i++) {
                    var component = self.components[i];
                    if (component[property] && !isNaN(component[property])) {
                        result = result + parseFloat(component[property]);
                        count = count + 1;
                    }
                }
                return result / count;
            };
            self.Attachment = function(component, attachment) {
                console.log("--component--");
                console.log(component);
                console.log("--attachment--");
                console.log(attachment);
                cornerPocket.db.getAttachment(component.id, attachment.name, function(err, res) {
                    if (err) {
                        console.log(err);
                        return;
                    }
                    console.log("starting read");
                    var reader = new window.FileReader();
                    reader.readAsDataURL(res);
                    reader.onloadend = function() {
                        console.log(reader.result);
                        attachment.data = reader.result;
                    }
                });
                return false;
            }
        }
        //helper function
        function b64toBlob(b64Data, contentType, sliceSize) {
            contentType = contentType || '';
            sliceSize = sliceSize || 512;

            var byteCharacters = atob(b64Data);
            var byteArrays = [];

            for (var offset = 0; offset < byteCharacters.length; offset += sliceSize) {
                var slice = byteCharacters.slice(offset, offset + sliceSize);

                var byteNumbers = new Array(slice.length);
                for (var i = 0; i < slice.length; i++) {
                    byteNumbers[i] = slice.charCodeAt(i);
                }

                var byteArray = new Uint8Array(byteNumbers);

                byteArrays.push(byteArray);
            }

            var blob = new Blob(byteArrays, {type: contentType});
            return blob;
        }
        //return object/function
        return {
            fn: function(project, reportDoc) {
                console.log("report");
                console.log(reportDoc);
                var deferred = $q.defer();
                var options = {
                    startkey: [project._id, "0"],
                    endkey: [project._id, "9"],
                };
                var reportText = "";
                //begin scope configuration - project
                var scope = $rootScope.$new(true);
                cornerPocket.db.query('components/forProjectId', options, function(err, result) {
                    if (err) {
                        console.log(err);
                        deferred.reject(err);
                        return;
                    }
                    //project's components
                    var components = result.rows;
                    console.log(components);
                    scope.project = $.extend({}, project.values);
                    scope.project._notes = project.notes;
                    scope.project._name = project.name;
                    scope.project._tag = project.tag;
                    scope.project._created = project.created;
                    scope.project._updated = project.updated;
                    scope.report_created = new Date();
                    scope.triggers = {};
                    var bodyText = "";
                    console.log("1");
                    //promise array for fetching docs
                    var promises = [cornerPocket.db.get("common", {attachments:true})];
                    //get requests components
                    for (var i = 0; i < components.length; i++) {
                        var component = components[i];
                        promises.push(cornerPocket.db.get(component.id, {
                            attachments: true
                        }));
                    }
                    console.log("2");
                    //upon promise resolution...
                    $q.all(promises).then(function(results) {
                        console.log("3");
                        //...set up each doc
                        var loadedComponents = [];
                        scope.common = results[0];
                        console.log(scope.common);
                        scope.common.id = scope.common._id;
                        delete scope.common._id;
                        scope.common.attachments = [];
                        var attachment, blob;
                        for (var prop in scope.common._attachments){
                            attachment = scope.common._attachments[prop];
                            //Maybe use Blobs to increase performance for report preview - need to evaluate on iPad
                            blob = b64toBlob(attachment.data, attachment.contentType);
                            scope.common.attachments.push({
                                name: prop,
                                url: URL.createObjectURL(blob),
                                docUrl: "report_files/common----" + prop
                            });
                            delete scope.common._attachments[prop];
                        }
                        for (var i = 1; i < results.length; i++) {
                            var component = results[i];
                            var componentScope = {};
                            componentScope = $.extend({}, component.values);
                            componentScope.schemaId = component.schemaId;
                            componentScope['name'] = component.name;
                            componentScope['tag'] = component.tag;
                            componentScope['space'] = component.space;
                            componentScope['id'] = component._id;
                            componentScope.attachments = [];
                            for (var prop in component._attachments) {
                                var attachment = component._attachments[prop];
                                componentScope.attachments.push({
                                    name: prop.split(".")[0],
                                    url: "data:" + attachment.content_type + ";base64," + attachment.data,
                                    docUrl: "report_files/" + component._id + "----" + prop
                                });
                            }
                            loadedComponents.push(componentScope);
                        }
                        //index loaded components incase we need them
                        
                        var indexedComponents = _.indexBy(loadedComponents.concat([scope.common]), 'id');
                        //now that we have all the data, lets process the report
                        //now lets actually process the report
                        for (var i = 0; i < reportDoc.triggers.length; i++) {
                            var trigger = reportDoc.triggers[i];
                            //cleaned trigger name
                            var cleanedName = trigger.name.replace(' ', '_');
                            //create trigger object
                            scope.triggers[cleanedName] = new Trigger();
                            ////console.log(trigger);
                            //we'll need to echo the body for each qualifiying component
                            if (trigger.schemaIds) {
                                _.each(loadedComponents, function(componentScope) {
                                    //test to make sure this component qualifies for this trigger
                                    if (_.contains(trigger.schemaIds, componentScope.schemaId)) {
                                        if ($parse(trigger.condition)(componentScope) === true || trigger.condition == true) {
                                            //add component to the list
                                            scope.triggers[cleanedName].components.push(componentScope);
                                        }
                                    }
                                });
                                console.log(scope.triggers);
                                //if we found at least one component...
                                if (scope.triggers[cleanedName].components.length > 0) {
                                    //echo header
                                    if (trigger.header) {
                                        bodyText += trigger.header;
                                    }
                                    //echo body
                                    if (trigger.body) {
                                        /*
									var asElement = angular.element(trigger.body);
									//console.log("--element");
									//console.log(asElement);
							
									//if body has single parent element
									if(asElement.length === 1){
										//console.log(asElement[0]);
										asElement[0].setAttribute("ng-repeat", 'component in triggers.' + cleanedName + '.components');
										bodyText += asElement[0].outerHTML;
										//console.log(asElement[0].outerHTML);
									}else{//wrap in div
										bodyText += "<div ng-repeat='component in triggers." + cleanedName + ".components'>";
						                bodyText += trigger.body;
										bodyText += "</div>";
									}
									*/
                                        bodyText += trigger.body;
                                    }
                                    //lets echo the footer
                                    if (trigger.footer) {
                                        bodyText += trigger.footer;
                                    }
                                }
                            } else { //just echo once
                                //Echo header
                                if (trigger.header) {
                                    bodyText += trigger.header;
                                }
                                //Echo header
                                if (trigger.body) {
                                    bodyText += trigger.body;
                                }
                                //Echo footer
                                if (trigger.footer) {
                                    bodyText += trigger.footer;
                                }
                            }
                        } //Loop through to next trigger
                        var style = reportDoc.styles ? reportDoc.styles : "";
                        reportText = "<html " + "xmlns:o='urn:schemas-microsoft-com:office:office' " + "xmlns:w='urn:schemas-microsoft-com:office:word'" + "xmlns='http://www.w3.org/TR/REC-html40'>" + "<head><title>Time</title>";
                        reportText += "<!--[if gte mso 9]>" + "<xml>" + "<w:WordDocument>" + "<w:View>Print</w:View>" + "<w:Zoom>90</w:Zoom>" + "<w:DoNotOptimizeForBrowser/>" + "</w:WordDocument>" + "</xml>" + "<![endif]-->";
                        reportText += "<style>" + "<!-- /* Style Definitions */" + "@page Section1" + "   {size:8.5in 11.0in; " + "   margin:1.0in 1.25in 1.0in 1.25in ; " + "   mso-header-margin:.5in; " + "   mso-footer-margin:.5in; mso-paper-source:0;}" + " div.Section1" + "   {page:Section1;}" + "table{border-collapse: collapse;}" + "td{border: 1px solid black;padding: 5pt;}" + "th{border: 1px solid black;padding: 5pt;}" + style + "-->" + "</style></head>";
                        //compile report text 
                        var compiledPreview = $compile(bodyText)(scope);
                        //replace .url with .murl for use with MHTML document					
                        var compiledDoc = $compile(bodyText.replace(/\.url}}/g, ".docUrl}}"))(scope);
                        //create temp documents to hold elements
                        var tmpPreview = document.createElement("div");
                        var tmpDoc = document.createElement("div");
                        //add each element to preview
                        for (var i = 0; i < compiledPreview.length; i++) {
                            tmpPreview.appendChild(compiledPreview[i]);
                        }
                        //add each element to document
                        for (var i = 0; i < compiledDoc.length; i++) {
                            tmpDoc.appendChild(compiledDoc[i]);
                        }
                        //need to remove this from angular so we can run out scope.apply in peace
                        setTimeout(function() {
                            //causes compilation
                            scope.$apply();
                            //strip out angular comments
                            var previewHtml = tmpPreview.innerHTML.replace(/<!--[\s\S]*?-->/g, "");
                            var docHtml = tmpDoc.innerHTML.replace(/<!--[\s\S]*?-->/g, "");
                            /*
						//add to report text
						var previewHtml += reportText + "<body lang=EN-US style='tab-interval:.5in'>" + previewHtml + "</body></html>";
						var docHtml += reportText + "<body lang=EN-US style='tab-interval:.5in'>" + docHtml + "</body></html>";
						*/
                            //instantiate report
                            var report = {};
                            //set preview html
                            report.html = reportText + "<body>" + previewHtml + "</body><html>";
                            docHtml = reportText + "<body>" + docHtml + "</body><html>";
                            //construct MHTMLDocument
                            var doc = MHTMLDoc.new();
                            //main html body
                            doc.addFile("report.htm", "text/html", btoa(docHtml));
                            //IMAGES
                            //get list of matches where we're referencing an 'external' file
                            var urls = docHtml.match(/(report_files\/)([^'"]*)/g);
                            //loop through each and add file to reportDoc
                            if (urls) {
                                for (var i = 0; i < urls.length; i++) {
                                    var urlTokens = urls[i].replace("report_files/", '').split("----");
                                    var componentId = urlTokens[0];
                                    var attachmentId = urlTokens[1].split(".")[0];
                                    var attachment = _.findWhere(indexedComponents[componentId].attachments, {
                                        name: attachmentId
                                    });
                                    //console.log(attachment.url.slice(23));
                                    doc.addFile(attachmentId, "image/jpeg", attachment.url.slice(23));
                                }
                            }
                            //output MHTMLDocument to report object
                            report.doc = doc.getDoc();
                            report.title = project.name + " - " + reportDoc.name + ".doc";
                            deferred.resolve(report);
                        });
                    }, function(err) {
                        //ERROR HANDLING
                        console.log(err);
                    });
                });
                var success = function() {};
                return deferred.promise;
            }
        }
    }
]).value('ioniconList', 
[
	{
		value: 'alert', 
		label:'<i class="icon ion-alert"></i> alert'
	},
	{
		value: 'alert-circled', 
		label:'<i class="icon ion-alert-circled"></i> alert-circled'
	},
	{
		value: 'android-add', 
		label:'<i class="icon ion-android-add"></i> android-add'
	},
	{
		value: 'android-add-contact', 
		label:'<i class="icon ion-android-add-contact"></i> android-add-contact'
	},
	{
		value: 'android-alarm', 
		label:'<i class="icon ion-android-alarm"></i> android-alarm'
	},
	{
		value: 'android-archive', 
		label:'<i class="icon ion-android-archive"></i> android-archive'
	},
	{
		value: 'android-arrow-back', 
		label:'<i class="icon ion-android-arrow-back"></i> android-arrow-back'
	},
	{
		value: 'android-arrow-down-left', 
		label:'<i class="icon ion-android-arrow-down-left"></i> android-arrow-down-left'
	},
	{
		value: 'android-arrow-down-right', 
		label:'<i class="icon ion-android-arrow-down-right"></i> android-arrow-down-right'
	},
	{
		value: 'android-arrow-forward', 
		label:'<i class="icon ion-android-arrow-forward"></i> android-arrow-forward'
	},
	{
		value: 'android-arrow-up-left', 
		label:'<i class="icon ion-android-arrow-up-left"></i> android-arrow-up-left'
	},
	{
		value: 'android-arrow-up-right', 
		label:'<i class="icon ion-android-arrow-up-right"></i> android-arrow-up-right'
	},
	{
		value: 'android-battery', 
		label:'<i class="icon ion-android-battery"></i> android-battery'
	},
	{
		value: 'android-book', 
		label:'<i class="icon ion-android-book"></i> android-book'
	},
	{
		value: 'android-calendar', 
		label:'<i class="icon ion-android-calendar"></i> android-calendar'
	},
	{
		value: 'android-call', 
		label:'<i class="icon ion-android-call"></i> android-call'
	},
	{
		value: 'android-camera', 
		label:'<i class="icon ion-android-camera"></i> android-camera'
	},
	{
		value: 'android-chat', 
		label:'<i class="icon ion-android-chat"></i> android-chat'
	},
	{
		value: 'android-checkmark', 
		label:'<i class="icon ion-android-checkmark"></i> android-checkmark'
	},
	{
		value: 'android-clock', 
		label:'<i class="icon ion-android-clock"></i> android-clock'
	},
	{
		value: 'android-close', 
		label:'<i class="icon ion-android-close"></i> android-close'
	},
	{
		value: 'android-contact', 
		label:'<i class="icon ion-android-contact"></i> android-contact'
	},
	{
		value: 'android-contacts', 
		label:'<i class="icon ion-android-contacts"></i> android-contacts'
	},
	{
		value: 'android-data', 
		label:'<i class="icon ion-android-data"></i> android-data'
	},
	{
		value: 'android-developer', 
		label:'<i class="icon ion-android-developer"></i> android-developer'
	},
	{
		value: 'android-display', 
		label:'<i class="icon ion-android-display"></i> android-display'
	},
	{
		value: 'android-download', 
		label:'<i class="icon ion-android-download"></i> android-download'
	},
	{
		value: 'android-drawer', 
		label:'<i class="icon ion-android-drawer"></i> android-drawer'
	},
	{
		value: 'android-dropdown', 
		label:'<i class="icon ion-android-dropdown"></i> android-dropdown'
	},
	{
		value: 'android-earth', 
		label:'<i class="icon ion-android-earth"></i> android-earth'
	},
	{
		value: 'android-folder', 
		label:'<i class="icon ion-android-folder"></i> android-folder'
	},
	{
		value: 'android-forums', 
		label:'<i class="icon ion-android-forums"></i> android-forums'
	},
	{
		value: 'android-friends', 
		label:'<i class="icon ion-android-friends"></i> android-friends'
	},
	{
		value: 'android-hand', 
		label:'<i class="icon ion-android-hand"></i> android-hand'
	},
	{
		value: 'android-image', 
		label:'<i class="icon ion-android-image"></i> android-image'
	},
	{
		value: 'android-inbox', 
		label:'<i class="icon ion-android-inbox"></i> android-inbox'
	},
	{
		value: 'android-information', 
		label:'<i class="icon ion-android-information"></i> android-information'
	},
	{
		value: 'android-keypad', 
		label:'<i class="icon ion-android-keypad"></i> android-keypad'
	},
	{
		value: 'android-lightbulb', 
		label:'<i class="icon ion-android-lightbulb"></i> android-lightbulb'
	},
	{
		value: 'android-locate', 
		label:'<i class="icon ion-android-locate"></i> android-locate'
	},
	{
		value: 'android-location', 
		label:'<i class="icon ion-android-location"></i> android-location'
	},
	{
		value: 'android-mail', 
		label:'<i class="icon ion-android-mail"></i> android-mail'
	},
	{
		value: 'android-microphone', 
		label:'<i class="icon ion-android-microphone"></i> android-microphone'
	},
	{
		value: 'android-mixer', 
		label:'<i class="icon ion-android-mixer"></i> android-mixer'
	},
	{
		value: 'android-more', 
		label:'<i class="icon ion-android-more"></i> android-more'
	},
	{
		value: 'android-note', 
		label:'<i class="icon ion-android-note"></i> android-note'
	},
	{
		value: 'android-playstore', 
		label:'<i class="icon ion-android-playstore"></i> android-playstore'
	},
	{
		value: 'android-printer', 
		label:'<i class="icon ion-android-printer"></i> android-printer'
	},
	{
		value: 'android-promotion', 
		label:'<i class="icon ion-android-promotion"></i> android-promotion'
	},
	{
		value: 'android-reminder', 
		label:'<i class="icon ion-android-reminder"></i> android-reminder'
	},
	{
		value: 'android-remove', 
		label:'<i class="icon ion-android-remove"></i> android-remove'
	},
	{
		value: 'android-search', 
		label:'<i class="icon ion-android-search"></i> android-search'
	},
	{
		value: 'android-send', 
		label:'<i class="icon ion-android-send"></i> android-send'
	},
	{
		value: 'android-settings', 
		label:'<i class="icon ion-android-settings"></i> android-settings'
	},
	{
		value: 'android-share', 
		label:'<i class="icon ion-android-share"></i> android-share'
	},
	{
		value: 'android-social', 
		label:'<i class="icon ion-android-social"></i> android-social'
	},
	{
		value: 'android-social-user', 
		label:'<i class="icon ion-android-social-user"></i> android-social-user'
	},
	{
		value: 'android-sort', 
		label:'<i class="icon ion-android-sort"></i> android-sort'
	},
	{
		value: 'android-stair-drawer', 
		label:'<i class="icon ion-android-stair-drawer"></i> android-stair-drawer'
	},
	{
		value: 'android-star', 
		label:'<i class="icon ion-android-star"></i> android-star'
	},
	{
		value: 'android-stopwatch', 
		label:'<i class="icon ion-android-stopwatch"></i> android-stopwatch'
	},
	{
		value: 'android-storage', 
		label:'<i class="icon ion-android-storage"></i> android-storage'
	},
	{
		value: 'android-system-back', 
		label:'<i class="icon ion-android-system-back"></i> android-system-back'
	},
	{
		value: 'android-system-home', 
		label:'<i class="icon ion-android-system-home"></i> android-system-home'
	},
	{
		value: 'android-system-windows', 
		label:'<i class="icon ion-android-system-windows"></i> android-system-windows'
	},
	{
		value: 'android-timer', 
		label:'<i class="icon ion-android-timer"></i> android-timer'
	},
	{
		value: 'android-trash', 
		label:'<i class="icon ion-android-trash"></i> android-trash'
	},
	{
		value: 'android-user-menu', 
		label:'<i class="icon ion-android-user-menu"></i> android-user-menu'
	},
	{
		value: 'android-volume', 
		label:'<i class="icon ion-android-volume"></i> android-volume'
	},
	{
		value: 'android-wifi', 
		label:'<i class="icon ion-android-wifi"></i> android-wifi'
	},
	{
		value: 'aperture', 
		label:'<i class="icon ion-aperture"></i> aperture'
	},
	{
		value: 'archive', 
		label:'<i class="icon ion-archive"></i> archive'
	},
	{
		value: 'arrow-down-a', 
		label:'<i class="icon ion-arrow-down-a"></i> arrow-down-a'
	},
	{
		value: 'arrow-down-b', 
		label:'<i class="icon ion-arrow-down-b"></i> arrow-down-b'
	},
	{
		value: 'arrow-down-c', 
		label:'<i class="icon ion-arrow-down-c"></i> arrow-down-c'
	},
	{
		value: 'arrow-expand', 
		label:'<i class="icon ion-arrow-expand"></i> arrow-expand'
	},
	{
		value: 'arrow-graph-down-left', 
		label:'<i class="icon ion-arrow-graph-down-left"></i> arrow-graph-down-left'
	},
	{
		value: 'arrow-graph-down-right', 
		label:'<i class="icon ion-arrow-graph-down-right"></i> arrow-graph-down-right'
	},
	{
		value: 'arrow-graph-up-left', 
		label:'<i class="icon ion-arrow-graph-up-left"></i> arrow-graph-up-left'
	},
	{
		value: 'arrow-graph-up-right', 
		label:'<i class="icon ion-arrow-graph-up-right"></i> arrow-graph-up-right'
	},
	{
		value: 'arrow-left-a', 
		label:'<i class="icon ion-arrow-left-a"></i> arrow-left-a'
	},
	{
		value: 'arrow-left-b', 
		label:'<i class="icon ion-arrow-left-b"></i> arrow-left-b'
	},
	{
		value: 'arrow-left-c', 
		label:'<i class="icon ion-arrow-left-c"></i> arrow-left-c'
	},
	{
		value: 'arrow-move', 
		label:'<i class="icon ion-arrow-move"></i> arrow-move'
	},
	{
		value: 'arrow-resize', 
		label:'<i class="icon ion-arrow-resize"></i> arrow-resize'
	},
	{
		value: 'arrow-return-left', 
		label:'<i class="icon ion-arrow-return-left"></i> arrow-return-left'
	},
	{
		value: 'arrow-return-right', 
		label:'<i class="icon ion-arrow-return-right"></i> arrow-return-right'
	},
	{
		value: 'arrow-right-a', 
		label:'<i class="icon ion-arrow-right-a"></i> arrow-right-a'
	},
	{
		value: 'arrow-right-b', 
		label:'<i class="icon ion-arrow-right-b"></i> arrow-right-b'
	},
	{
		value: 'arrow-right-c', 
		label:'<i class="icon ion-arrow-right-c"></i> arrow-right-c'
	},
	{
		value: 'arrow-shrink', 
		label:'<i class="icon ion-arrow-shrink"></i> arrow-shrink'
	},
	{
		value: 'arrow-swap', 
		label:'<i class="icon ion-arrow-swap"></i> arrow-swap'
	},
	{
		value: 'arrow-up-a', 
		label:'<i class="icon ion-arrow-up-a"></i> arrow-up-a'
	},
	{
		value: 'arrow-up-b', 
		label:'<i class="icon ion-arrow-up-b"></i> arrow-up-b'
	},
	{
		value: 'arrow-up-c', 
		label:'<i class="icon ion-arrow-up-c"></i> arrow-up-c'
	},
	{
		value: 'asterisk', 
		label:'<i class="icon ion-asterisk"></i> asterisk'
	},
	{
		value: 'at', 
		label:'<i class="icon ion-at"></i> at'
	},
	{
		value: 'bag', 
		label:'<i class="icon ion-bag"></i> bag'
	},
	{
		value: 'battery-charging', 
		label:'<i class="icon ion-battery-charging"></i> battery-charging'
	},
	{
		value: 'battery-empty', 
		label:'<i class="icon ion-battery-empty"></i> battery-empty'
	},
	{
		value: 'battery-full', 
		label:'<i class="icon ion-battery-full"></i> battery-full'
	},
	{
		value: 'battery-half', 
		label:'<i class="icon ion-battery-half"></i> battery-half'
	},
	{
		value: 'battery-low', 
		label:'<i class="icon ion-battery-low"></i> battery-low'
	},
	{
		value: 'beaker', 
		label:'<i class="icon ion-beaker"></i> beaker'
	},
	{
		value: 'beer', 
		label:'<i class="icon ion-beer"></i> beer'
	},
	{
		value: 'bluetooth', 
		label:'<i class="icon ion-bluetooth"></i> bluetooth'
	},
	{
		value: 'bonfire', 
		label:'<i class="icon ion-bonfire"></i> bonfire'
	},
	{
		value: 'bookmark', 
		label:'<i class="icon ion-bookmark"></i> bookmark'
	},
	{
		value: 'briefcase', 
		label:'<i class="icon ion-briefcase"></i> briefcase'
	},
	{
		value: 'bug', 
		label:'<i class="icon ion-bug"></i> bug'
	},
	{
		value: 'calculator', 
		label:'<i class="icon ion-calculator"></i> calculator'
	},
	{
		value: 'calendar', 
		label:'<i class="icon ion-calendar"></i> calendar'
	},
	{
		value: 'camera', 
		label:'<i class="icon ion-camera"></i> camera'
	},
	{
		value: 'card', 
		label:'<i class="icon ion-card"></i> card'
	},
	{
		value: 'cash', 
		label:'<i class="icon ion-cash"></i> cash'
	},
	{
		value: 'chatbox', 
		label:'<i class="icon ion-chatbox"></i> chatbox'
	},
	{
		value: 'chatbox-working', 
		label:'<i class="icon ion-chatbox-working"></i> chatbox-working'
	},
	{
		value: 'chatboxes', 
		label:'<i class="icon ion-chatboxes"></i> chatboxes'
	},
	{
		value: 'chatbubble', 
		label:'<i class="icon ion-chatbubble"></i> chatbubble'
	},
	{
		value: 'chatbubble-working', 
		label:'<i class="icon ion-chatbubble-working"></i> chatbubble-working'
	},
	{
		value: 'chatbubbles', 
		label:'<i class="icon ion-chatbubbles"></i> chatbubbles'
	},
	{
		value: 'checkmark', 
		label:'<i class="icon ion-checkmark"></i> checkmark'
	},
	{
		value: 'checkmark-circled', 
		label:'<i class="icon ion-checkmark-circled"></i> checkmark-circled'
	},
	{
		value: 'checkmark-round', 
		label:'<i class="icon ion-checkmark-round"></i> checkmark-round'
	},
	{
		value: 'chevron-down', 
		label:'<i class="icon ion-chevron-down"></i> chevron-down'
	},
	{
		value: 'chevron-left', 
		label:'<i class="icon ion-chevron-left"></i> chevron-left'
	},
	{
		value: 'chevron-right', 
		label:'<i class="icon ion-chevron-right"></i> chevron-right'
	},
	{
		value: 'chevron-up', 
		label:'<i class="icon ion-chevron-up"></i> chevron-up'
	},
	{
		value: 'clipboard', 
		label:'<i class="icon ion-clipboard"></i> clipboard'
	},
	{
		value: 'clock', 
		label:'<i class="icon ion-clock"></i> clock'
	},
	{
		value: 'close', 
		label:'<i class="icon ion-close"></i> close'
	},
	{
		value: 'close-circled', 
		label:'<i class="icon ion-close-circled"></i> close-circled'
	},
	{
		value: 'close-round', 
		label:'<i class="icon ion-close-round"></i> close-round'
	},
	{
		value: 'closed-captioning', 
		label:'<i class="icon ion-closed-captioning"></i> closed-captioning'
	},
	{
		value: 'cloud', 
		label:'<i class="icon ion-cloud"></i> cloud'
	},
	{
		value: 'code', 
		label:'<i class="icon ion-code"></i> code'
	},
	{
		value: 'code-download', 
		label:'<i class="icon ion-code-download"></i> code-download'
	},
	{
		value: 'code-working', 
		label:'<i class="icon ion-code-working"></i> code-working'
	},
	{
		value: 'coffee', 
		label:'<i class="icon ion-coffee"></i> coffee'
	},
	{
		value: 'compass', 
		label:'<i class="icon ion-compass"></i> compass'
	},
	{
		value: 'compose', 
		label:'<i class="icon ion-compose"></i> compose'
	},
	{
		value: 'connection-bars', 
		label:'<i class="icon ion-connection-bars"></i> connection-bars'
	},
	{
		value: 'contrast', 
		label:'<i class="icon ion-contrast"></i> contrast'
	},
	{
		value: 'cube', 
		label:'<i class="icon ion-cube"></i> cube'
	},
	{
		value: 'disc', 
		label:'<i class="icon ion-disc"></i> disc'
	},
	{
		value: 'document', 
		label:'<i class="icon ion-document"></i> document'
	},
	{
		value: 'document-text', 
		label:'<i class="icon ion-document-text"></i> document-text'
	},
	{
		value: 'drag', 
		label:'<i class="icon ion-drag"></i> drag'
	},
	{
		value: 'earth', 
		label:'<i class="icon ion-earth"></i> earth'
	},
	{
		value: 'edit', 
		label:'<i class="icon ion-edit"></i> edit'
	},
	{
		value: 'egg', 
		label:'<i class="icon ion-egg"></i> egg'
	},
	{
		value: 'eject', 
		label:'<i class="icon ion-eject"></i> eject'
	},
	{
		value: 'email', 
		label:'<i class="icon ion-email"></i> email'
	},
	{
		value: 'eye', 
		label:'<i class="icon ion-eye"></i> eye'
	},
	{
		value: 'eye-disabled', 
		label:'<i class="icon ion-eye-disabled"></i> eye-disabled'
	},
	{
		value: 'female', 
		label:'<i class="icon ion-female"></i> female'
	},
	{
		value: 'filing', 
		label:'<i class="icon ion-filing"></i> filing'
	},
	{
		value: 'film-marker', 
		label:'<i class="icon ion-film-marker"></i> film-marker'
	},
	{
		value: 'fireball', 
		label:'<i class="icon ion-fireball"></i> fireball'
	},
	{
		value: 'flag', 
		label:'<i class="icon ion-flag"></i> flag'
	},
	{
		value: 'flame', 
		label:'<i class="icon ion-flame"></i> flame'
	},
	{
		value: 'flash', 
		label:'<i class="icon ion-flash"></i> flash'
	},
	{
		value: 'flash-off', 
		label:'<i class="icon ion-flash-off"></i> flash-off'
	},
	{
		value: 'flask', 
		label:'<i class="icon ion-flask"></i> flask'
	},
	{
		value: 'folder', 
		label:'<i class="icon ion-folder"></i> folder'
	},
	{
		value: 'fork', 
		label:'<i class="icon ion-fork"></i> fork'
	},
	{
		value: 'fork-repo', 
		label:'<i class="icon ion-fork-repo"></i> fork-repo'
	},
	{
		value: 'forward', 
		label:'<i class="icon ion-forward"></i> forward'
	},
	{
		value: 'funnel', 
		label:'<i class="icon ion-funnel"></i> funnel'
	},
	{
		value: 'game-controller-a', 
		label:'<i class="icon ion-game-controller-a"></i> game-controller-a'
	},
	{
		value: 'game-controller-b', 
		label:'<i class="icon ion-game-controller-b"></i> game-controller-b'
	},
	{
		value: 'gear-a', 
		label:'<i class="icon ion-gear-a"></i> gear-a'
	},
	{
		value: 'gear-b', 
		label:'<i class="icon ion-gear-b"></i> gear-b'
	},
	{
		value: 'grid', 
		label:'<i class="icon ion-grid"></i> grid'
	},
	{
		value: 'hammer', 
		label:'<i class="icon ion-hammer"></i> hammer'
	},
	{
		value: 'happy', 
		label:'<i class="icon ion-happy"></i> happy'
	},
	{
		value: 'headphone', 
		label:'<i class="icon ion-headphone"></i> headphone'
	},
	{
		value: 'heart', 
		label:'<i class="icon ion-heart"></i> heart'
	},
	{
		value: 'heart-broken', 
		label:'<i class="icon ion-heart-broken"></i> heart-broken'
	},
	{
		value: 'help', 
		label:'<i class="icon ion-help"></i> help'
	},
	{
		value: 'help-buoy', 
		label:'<i class="icon ion-help-buoy"></i> help-buoy'
	},
	{
		value: 'help-circled', 
		label:'<i class="icon ion-help-circled"></i> help-circled'
	},
	{
		value: 'home', 
		label:'<i class="icon ion-home"></i> home'
	},
	{
		value: 'icecream', 
		label:'<i class="icon ion-icecream"></i> icecream'
	},
	{
		value: 'icon-social-google-plus', 
		label:'<i class="icon ion-icon-social-google-plus"></i> icon-social-google-plus'
	},
	{
		value: 'icon-social-google-plus-outline', 
		label:'<i class="icon ion-icon-social-google-plus-outline"></i> icon-social-google-plus-outline'
	},
	{
		value: 'image', 
		label:'<i class="icon ion-image"></i> image'
	},
	{
		value: 'images', 
		label:'<i class="icon ion-images"></i> images'
	},
	{
		value: 'information', 
		label:'<i class="icon ion-information"></i> information'
	},
	{
		value: 'information-circled', 
		label:'<i class="icon ion-information-circled"></i> information-circled'
	},
	{
		value: 'ionic', 
		label:'<i class="icon ion-ionic"></i> ionic'
	},
	{
		value: 'ios7-alarm', 
		label:'<i class="icon ion-ios7-alarm"></i> ios7-alarm'
	},
	{
		value: 'ios7-alarm-outline', 
		label:'<i class="icon ion-ios7-alarm-outline"></i> ios7-alarm-outline'
	},
	{
		value: 'ios7-albums', 
		label:'<i class="icon ion-ios7-albums"></i> ios7-albums'
	},
	{
		value: 'ios7-albums-outline', 
		label:'<i class="icon ion-ios7-albums-outline"></i> ios7-albums-outline'
	},
	{
		value: 'ios7-americanfootball', 
		label:'<i class="icon ion-ios7-americanfootball"></i> ios7-americanfootball'
	},
	{
		value: 'ios7-americanfootball-outline', 
		label:'<i class="icon ion-ios7-americanfootball-outline"></i> ios7-americanfootball-outline'
	},
	{
		value: 'ios7-analytics', 
		label:'<i class="icon ion-ios7-analytics"></i> ios7-analytics'
	},
	{
		value: 'ios7-analytics-outline', 
		label:'<i class="icon ion-ios7-analytics-outline"></i> ios7-analytics-outline'
	},
	{
		value: 'ios7-arrow-back', 
		label:'<i class="icon ion-ios7-arrow-back"></i> ios7-arrow-back'
	},
	{
		value: 'ios7-arrow-down', 
		label:'<i class="icon ion-ios7-arrow-down"></i> ios7-arrow-down'
	},
	{
		value: 'ios7-arrow-forward', 
		label:'<i class="icon ion-ios7-arrow-forward"></i> ios7-arrow-forward'
	},
	{
		value: 'ios7-arrow-left', 
		label:'<i class="icon ion-ios7-arrow-left"></i> ios7-arrow-left'
	},
	{
		value: 'ios7-arrow-right', 
		label:'<i class="icon ion-ios7-arrow-right"></i> ios7-arrow-right'
	},
	{
		value: 'ios7-arrow-thin-down', 
		label:'<i class="icon ion-ios7-arrow-thin-down"></i> ios7-arrow-thin-down'
	},
	{
		value: 'ios7-arrow-thin-left', 
		label:'<i class="icon ion-ios7-arrow-thin-left"></i> ios7-arrow-thin-left'
	},
	{
		value: 'ios7-arrow-thin-right', 
		label:'<i class="icon ion-ios7-arrow-thin-right"></i> ios7-arrow-thin-right'
	},
	{
		value: 'ios7-arrow-thin-up', 
		label:'<i class="icon ion-ios7-arrow-thin-up"></i> ios7-arrow-thin-up'
	},
	{
		value: 'ios7-arrow-up', 
		label:'<i class="icon ion-ios7-arrow-up"></i> ios7-arrow-up'
	},
	{
		value: 'ios7-at', 
		label:'<i class="icon ion-ios7-at"></i> ios7-at'
	},
	{
		value: 'ios7-at-outline', 
		label:'<i class="icon ion-ios7-at-outline"></i> ios7-at-outline'
	},
	{
		value: 'ios7-barcode', 
		label:'<i class="icon ion-ios7-barcode"></i> ios7-barcode'
	},
	{
		value: 'ios7-barcode-outline', 
		label:'<i class="icon ion-ios7-barcode-outline"></i> ios7-barcode-outline'
	},
	{
		value: 'ios7-baseball', 
		label:'<i class="icon ion-ios7-baseball"></i> ios7-baseball'
	},
	{
		value: 'ios7-baseball-outline', 
		label:'<i class="icon ion-ios7-baseball-outline"></i> ios7-baseball-outline'
	},
	{
		value: 'ios7-basketball', 
		label:'<i class="icon ion-ios7-basketball"></i> ios7-basketball'
	},
	{
		value: 'ios7-basketball-outline', 
		label:'<i class="icon ion-ios7-basketball-outline"></i> ios7-basketball-outline'
	},
	{
		value: 'ios7-bell', 
		label:'<i class="icon ion-ios7-bell"></i> ios7-bell'
	},
	{
		value: 'ios7-bell-outline', 
		label:'<i class="icon ion-ios7-bell-outline"></i> ios7-bell-outline'
	},
	{
		value: 'ios7-bolt', 
		label:'<i class="icon ion-ios7-bolt"></i> ios7-bolt'
	},
	{
		value: 'ios7-bolt-outline', 
		label:'<i class="icon ion-ios7-bolt-outline"></i> ios7-bolt-outline'
	},
	{
		value: 'ios7-bookmarks', 
		label:'<i class="icon ion-ios7-bookmarks"></i> ios7-bookmarks'
	},
	{
		value: 'ios7-bookmarks-outline', 
		label:'<i class="icon ion-ios7-bookmarks-outline"></i> ios7-bookmarks-outline'
	},
	{
		value: 'ios7-box', 
		label:'<i class="icon ion-ios7-box"></i> ios7-box'
	},
	{
		value: 'ios7-box-outline', 
		label:'<i class="icon ion-ios7-box-outline"></i> ios7-box-outline'
	},
	{
		value: 'ios7-briefcase', 
		label:'<i class="icon ion-ios7-briefcase"></i> ios7-briefcase'
	},
	{
		value: 'ios7-briefcase-outline', 
		label:'<i class="icon ion-ios7-briefcase-outline"></i> ios7-briefcase-outline'
	},
	{
		value: 'ios7-browsers', 
		label:'<i class="icon ion-ios7-browsers"></i> ios7-browsers'
	},
	{
		value: 'ios7-browsers-outline', 
		label:'<i class="icon ion-ios7-browsers-outline"></i> ios7-browsers-outline'
	},
	{
		value: 'ios7-calculator', 
		label:'<i class="icon ion-ios7-calculator"></i> ios7-calculator'
	},
	{
		value: 'ios7-calculator-outline', 
		label:'<i class="icon ion-ios7-calculator-outline"></i> ios7-calculator-outline'
	},
	{
		value: 'ios7-calendar', 
		label:'<i class="icon ion-ios7-calendar"></i> ios7-calendar'
	},
	{
		value: 'ios7-calendar-outline', 
		label:'<i class="icon ion-ios7-calendar-outline"></i> ios7-calendar-outline'
	},
	{
		value: 'ios7-camera', 
		label:'<i class="icon ion-ios7-camera"></i> ios7-camera'
	},
	{
		value: 'ios7-camera-outline', 
		label:'<i class="icon ion-ios7-camera-outline"></i> ios7-camera-outline'
	},
	{
		value: 'ios7-cart', 
		label:'<i class="icon ion-ios7-cart"></i> ios7-cart'
	},
	{
		value: 'ios7-cart-outline', 
		label:'<i class="icon ion-ios7-cart-outline"></i> ios7-cart-outline'
	},
	{
		value: 'ios7-chatboxes', 
		label:'<i class="icon ion-ios7-chatboxes"></i> ios7-chatboxes'
	},
	{
		value: 'ios7-chatboxes-outline', 
		label:'<i class="icon ion-ios7-chatboxes-outline"></i> ios7-chatboxes-outline'
	},
	{
		value: 'ios7-chatbubble', 
		label:'<i class="icon ion-ios7-chatbubble"></i> ios7-chatbubble'
	},
	{
		value: 'ios7-chatbubble-outline', 
		label:'<i class="icon ion-ios7-chatbubble-outline"></i> ios7-chatbubble-outline'
	},
	{
		value: 'ios7-checkmark', 
		label:'<i class="icon ion-ios7-checkmark"></i> ios7-checkmark'
	},
	{
		value: 'ios7-checkmark-empty', 
		label:'<i class="icon ion-ios7-checkmark-empty"></i> ios7-checkmark-empty'
	},
	{
		value: 'ios7-checkmark-outline', 
		label:'<i class="icon ion-ios7-checkmark-outline"></i> ios7-checkmark-outline'
	},
	{
		value: 'ios7-circle-filled', 
		label:'<i class="icon ion-ios7-circle-filled"></i> ios7-circle-filled'
	},
	{
		value: 'ios7-circle-outline', 
		label:'<i class="icon ion-ios7-circle-outline"></i> ios7-circle-outline'
	},
	{
		value: 'ios7-clock', 
		label:'<i class="icon ion-ios7-clock"></i> ios7-clock'
	},
	{
		value: 'ios7-clock-outline', 
		label:'<i class="icon ion-ios7-clock-outline"></i> ios7-clock-outline'
	},
	{
		value: 'ios7-close', 
		label:'<i class="icon ion-ios7-close"></i> ios7-close'
	},
	{
		value: 'ios7-close-empty', 
		label:'<i class="icon ion-ios7-close-empty"></i> ios7-close-empty'
	},
	{
		value: 'ios7-close-outline', 
		label:'<i class="icon ion-ios7-close-outline"></i> ios7-close-outline'
	},
	{
		value: 'ios7-cloud', 
		label:'<i class="icon ion-ios7-cloud"></i> ios7-cloud'
	},
	{
		value: 'ios7-cloud-download', 
		label:'<i class="icon ion-ios7-cloud-download"></i> ios7-cloud-download'
	},
	{
		value: 'ios7-cloud-download-outline', 
		label:'<i class="icon ion-ios7-cloud-download-outline"></i> ios7-cloud-download-outline'
	},
	{
		value: 'ios7-cloud-outline', 
		label:'<i class="icon ion-ios7-cloud-outline"></i> ios7-cloud-outline'
	},
	{
		value: 'ios7-cloud-upload', 
		label:'<i class="icon ion-ios7-cloud-upload"></i> ios7-cloud-upload'
	},
	{
		value: 'ios7-cloud-upload-outline', 
		label:'<i class="icon ion-ios7-cloud-upload-outline"></i> ios7-cloud-upload-outline'
	},
	{
		value: 'ios7-cloudy', 
		label:'<i class="icon ion-ios7-cloudy"></i> ios7-cloudy'
	},
	{
		value: 'ios7-cloudy-night', 
		label:'<i class="icon ion-ios7-cloudy-night"></i> ios7-cloudy-night'
	},
	{
		value: 'ios7-cloudy-night-outline', 
		label:'<i class="icon ion-ios7-cloudy-night-outline"></i> ios7-cloudy-night-outline'
	},
	{
		value: 'ios7-cloudy-outline', 
		label:'<i class="icon ion-ios7-cloudy-outline"></i> ios7-cloudy-outline'
	},
	{
		value: 'ios7-cog', 
		label:'<i class="icon ion-ios7-cog"></i> ios7-cog'
	},
	{
		value: 'ios7-cog-outline', 
		label:'<i class="icon ion-ios7-cog-outline"></i> ios7-cog-outline'
	},
	{
		value: 'ios7-compose', 
		label:'<i class="icon ion-ios7-compose"></i> ios7-compose'
	},
	{
		value: 'ios7-compose-outline', 
		label:'<i class="icon ion-ios7-compose-outline"></i> ios7-compose-outline'
	},
	{
		value: 'ios7-contact', 
		label:'<i class="icon ion-ios7-contact"></i> ios7-contact'
	},
	{
		value: 'ios7-contact-outline', 
		label:'<i class="icon ion-ios7-contact-outline"></i> ios7-contact-outline'
	},
	{
		value: 'ios7-copy', 
		label:'<i class="icon ion-ios7-copy"></i> ios7-copy'
	},
	{
		value: 'ios7-copy-outline', 
		label:'<i class="icon ion-ios7-copy-outline"></i> ios7-copy-outline'
	},
	{
		value: 'ios7-download', 
		label:'<i class="icon ion-ios7-download"></i> ios7-download'
	},
	{
		value: 'ios7-download-outline', 
		label:'<i class="icon ion-ios7-download-outline"></i> ios7-download-outline'
	},
	{
		value: 'ios7-drag', 
		label:'<i class="icon ion-ios7-drag"></i> ios7-drag'
	},
	{
		value: 'ios7-email', 
		label:'<i class="icon ion-ios7-email"></i> ios7-email'
	},
	{
		value: 'ios7-email-outline', 
		label:'<i class="icon ion-ios7-email-outline"></i> ios7-email-outline'
	},
	{
		value: 'ios7-expand', 
		label:'<i class="icon ion-ios7-expand"></i> ios7-expand'
	},
	{
		value: 'ios7-eye', 
		label:'<i class="icon ion-ios7-eye"></i> ios7-eye'
	},
	{
		value: 'ios7-eye-outline', 
		label:'<i class="icon ion-ios7-eye-outline"></i> ios7-eye-outline'
	},
	{
		value: 'ios7-fastforward', 
		label:'<i class="icon ion-ios7-fastforward"></i> ios7-fastforward'
	},
	{
		value: 'ios7-fastforward-outline', 
		label:'<i class="icon ion-ios7-fastforward-outline"></i> ios7-fastforward-outline'
	},
	{
		value: 'ios7-filing', 
		label:'<i class="icon ion-ios7-filing"></i> ios7-filing'
	},
	{
		value: 'ios7-filing-outline', 
		label:'<i class="icon ion-ios7-filing-outline"></i> ios7-filing-outline'
	},
	{
		value: 'ios7-film', 
		label:'<i class="icon ion-ios7-film"></i> ios7-film'
	},
	{
		value: 'ios7-film-outline', 
		label:'<i class="icon ion-ios7-film-outline"></i> ios7-film-outline'
	},
	{
		value: 'ios7-flag', 
		label:'<i class="icon ion-ios7-flag"></i> ios7-flag'
	},
	{
		value: 'ios7-flag-outline', 
		label:'<i class="icon ion-ios7-flag-outline"></i> ios7-flag-outline'
	},
	{
		value: 'ios7-folder', 
		label:'<i class="icon ion-ios7-folder"></i> ios7-folder'
	},
	{
		value: 'ios7-folder-outline', 
		label:'<i class="icon ion-ios7-folder-outline"></i> ios7-folder-outline'
	},
	{
		value: 'ios7-football', 
		label:'<i class="icon ion-ios7-football"></i> ios7-football'
	},
	{
		value: 'ios7-football-outline', 
		label:'<i class="icon ion-ios7-football-outline"></i> ios7-football-outline'
	},
	{
		value: 'ios7-gear', 
		label:'<i class="icon ion-ios7-gear"></i> ios7-gear'
	},
	{
		value: 'ios7-gear-outline', 
		label:'<i class="icon ion-ios7-gear-outline"></i> ios7-gear-outline'
	},
	{
		value: 'ios7-glasses', 
		label:'<i class="icon ion-ios7-glasses"></i> ios7-glasses'
	},
	{
		value: 'ios7-glasses-outline', 
		label:'<i class="icon ion-ios7-glasses-outline"></i> ios7-glasses-outline'
	},
	{
		value: 'ios7-heart', 
		label:'<i class="icon ion-ios7-heart"></i> ios7-heart'
	},
	{
		value: 'ios7-heart-outline', 
		label:'<i class="icon ion-ios7-heart-outline"></i> ios7-heart-outline'
	},
	{
		value: 'ios7-help', 
		label:'<i class="icon ion-ios7-help"></i> ios7-help'
	},
	{
		value: 'ios7-help-empty', 
		label:'<i class="icon ion-ios7-help-empty"></i> ios7-help-empty'
	},
	{
		value: 'ios7-help-outline', 
		label:'<i class="icon ion-ios7-help-outline"></i> ios7-help-outline'
	},
	{
		value: 'ios7-home', 
		label:'<i class="icon ion-ios7-home"></i> ios7-home'
	},
	{
		value: 'ios7-home-outline', 
		label:'<i class="icon ion-ios7-home-outline"></i> ios7-home-outline'
	},
	{
		value: 'ios7-infinite', 
		label:'<i class="icon ion-ios7-infinite"></i> ios7-infinite'
	},
	{
		value: 'ios7-infinite-outline', 
		label:'<i class="icon ion-ios7-infinite-outline"></i> ios7-infinite-outline'
	},
	{
		value: 'ios7-information', 
		label:'<i class="icon ion-ios7-information"></i> ios7-information'
	},
	{
		value: 'ios7-information-empty', 
		label:'<i class="icon ion-ios7-information-empty"></i> ios7-information-empty'
	},
	{
		value: 'ios7-information-outline', 
		label:'<i class="icon ion-ios7-information-outline"></i> ios7-information-outline'
	},
	{
		value: 'ios7-ionic-outline', 
		label:'<i class="icon ion-ios7-ionic-outline"></i> ios7-ionic-outline'
	},
	{
		value: 'ios7-keypad', 
		label:'<i class="icon ion-ios7-keypad"></i> ios7-keypad'
	},
	{
		value: 'ios7-keypad-outline', 
		label:'<i class="icon ion-ios7-keypad-outline"></i> ios7-keypad-outline'
	},
	{
		value: 'ios7-lightbulb', 
		label:'<i class="icon ion-ios7-lightbulb"></i> ios7-lightbulb'
	},
	{
		value: 'ios7-lightbulb-outline', 
		label:'<i class="icon ion-ios7-lightbulb-outline"></i> ios7-lightbulb-outline'
	},
	{
		value: 'ios7-location', 
		label:'<i class="icon ion-ios7-location"></i> ios7-location'
	},
	{
		value: 'ios7-location-outline', 
		label:'<i class="icon ion-ios7-location-outline"></i> ios7-location-outline'
	},
	{
		value: 'ios7-locked', 
		label:'<i class="icon ion-ios7-locked"></i> ios7-locked'
	},
	{
		value: 'ios7-locked-outline', 
		label:'<i class="icon ion-ios7-locked-outline"></i> ios7-locked-outline'
	},
	{
		value: 'ios7-loop', 
		label:'<i class="icon ion-ios7-loop"></i> ios7-loop'
	},
	{
		value: 'ios7-loop-strong', 
		label:'<i class="icon ion-ios7-loop-strong"></i> ios7-loop-strong'
	},
	{
		value: 'ios7-medkit', 
		label:'<i class="icon ion-ios7-medkit"></i> ios7-medkit'
	},
	{
		value: 'ios7-medkit-outline', 
		label:'<i class="icon ion-ios7-medkit-outline"></i> ios7-medkit-outline'
	},
	{
		value: 'ios7-mic', 
		label:'<i class="icon ion-ios7-mic"></i> ios7-mic'
	},
	{
		value: 'ios7-mic-off', 
		label:'<i class="icon ion-ios7-mic-off"></i> ios7-mic-off'
	},
	{
		value: 'ios7-mic-outline', 
		label:'<i class="icon ion-ios7-mic-outline"></i> ios7-mic-outline'
	},
	{
		value: 'ios7-minus', 
		label:'<i class="icon ion-ios7-minus"></i> ios7-minus'
	},
	{
		value: 'ios7-minus-empty', 
		label:'<i class="icon ion-ios7-minus-empty"></i> ios7-minus-empty'
	},
	{
		value: 'ios7-minus-outline', 
		label:'<i class="icon ion-ios7-minus-outline"></i> ios7-minus-outline'
	},
	{
		value: 'ios7-monitor', 
		label:'<i class="icon ion-ios7-monitor"></i> ios7-monitor'
	},
	{
		value: 'ios7-monitor-outline', 
		label:'<i class="icon ion-ios7-monitor-outline"></i> ios7-monitor-outline'
	},
	{
		value: 'ios7-moon', 
		label:'<i class="icon ion-ios7-moon"></i> ios7-moon'
	},
	{
		value: 'ios7-moon-outline', 
		label:'<i class="icon ion-ios7-moon-outline"></i> ios7-moon-outline'
	},
	{
		value: 'ios7-more', 
		label:'<i class="icon ion-ios7-more"></i> ios7-more'
	},
	{
		value: 'ios7-more-outline', 
		label:'<i class="icon ion-ios7-more-outline"></i> ios7-more-outline'
	},
	{
		value: 'ios7-musical-note', 
		label:'<i class="icon ion-ios7-musical-note"></i> ios7-musical-note'
	},
	{
		value: 'ios7-musical-notes', 
		label:'<i class="icon ion-ios7-musical-notes"></i> ios7-musical-notes'
	},
	{
		value: 'ios7-navigate', 
		label:'<i class="icon ion-ios7-navigate"></i> ios7-navigate'
	},
	{
		value: 'ios7-navigate-outline', 
		label:'<i class="icon ion-ios7-navigate-outline"></i> ios7-navigate-outline'
	},
	{
		value: 'ios7-paper', 
		label:'<i class="icon ion-ios7-paper"></i> ios7-paper'
	},
	{
		value: 'ios7-paper-outline', 
		label:'<i class="icon ion-ios7-paper-outline"></i> ios7-paper-outline'
	},
	{
		value: 'ios7-paperplane', 
		label:'<i class="icon ion-ios7-paperplane"></i> ios7-paperplane'
	},
	{
		value: 'ios7-paperplane-outline', 
		label:'<i class="icon ion-ios7-paperplane-outline"></i> ios7-paperplane-outline'
	},
	{
		value: 'ios7-partlysunny', 
		label:'<i class="icon ion-ios7-partlysunny"></i> ios7-partlysunny'
	},
	{
		value: 'ios7-partlysunny-outline', 
		label:'<i class="icon ion-ios7-partlysunny-outline"></i> ios7-partlysunny-outline'
	},
	{
		value: 'ios7-pause', 
		label:'<i class="icon ion-ios7-pause"></i> ios7-pause'
	},
	{
		value: 'ios7-pause-outline', 
		label:'<i class="icon ion-ios7-pause-outline"></i> ios7-pause-outline'
	},
	{
		value: 'ios7-paw', 
		label:'<i class="icon ion-ios7-paw"></i> ios7-paw'
	},
	{
		value: 'ios7-paw-outline', 
		label:'<i class="icon ion-ios7-paw-outline"></i> ios7-paw-outline'
	},
	{
		value: 'ios7-people', 
		label:'<i class="icon ion-ios7-people"></i> ios7-people'
	},
	{
		value: 'ios7-people-outline', 
		label:'<i class="icon ion-ios7-people-outline"></i> ios7-people-outline'
	},
	{
		value: 'ios7-person', 
		label:'<i class="icon ion-ios7-person"></i> ios7-person'
	},
	{
		value: 'ios7-person-outline', 
		label:'<i class="icon ion-ios7-person-outline"></i> ios7-person-outline'
	},
	{
		value: 'ios7-personadd', 
		label:'<i class="icon ion-ios7-personadd"></i> ios7-personadd'
	},
	{
		value: 'ios7-personadd-outline', 
		label:'<i class="icon ion-ios7-personadd-outline"></i> ios7-personadd-outline'
	},
	{
		value: 'ios7-photos', 
		label:'<i class="icon ion-ios7-photos"></i> ios7-photos'
	},
	{
		value: 'ios7-photos-outline', 
		label:'<i class="icon ion-ios7-photos-outline"></i> ios7-photos-outline'
	},
	{
		value: 'ios7-pie', 
		label:'<i class="icon ion-ios7-pie"></i> ios7-pie'
	},
	{
		value: 'ios7-pie-outline', 
		label:'<i class="icon ion-ios7-pie-outline"></i> ios7-pie-outline'
	},
	{
		value: 'ios7-play', 
		label:'<i class="icon ion-ios7-play"></i> ios7-play'
	},
	{
		value: 'ios7-play-outline', 
		label:'<i class="icon ion-ios7-play-outline"></i> ios7-play-outline'
	},
	{
		value: 'ios7-plus', 
		label:'<i class="icon ion-ios7-plus"></i> ios7-plus'
	},
	{
		value: 'ios7-plus-empty', 
		label:'<i class="icon ion-ios7-plus-empty"></i> ios7-plus-empty'
	},
	{
		value: 'ios7-plus-outline', 
		label:'<i class="icon ion-ios7-plus-outline"></i> ios7-plus-outline'
	},
	{
		value: 'ios7-pricetag', 
		label:'<i class="icon ion-ios7-pricetag"></i> ios7-pricetag'
	},
	{
		value: 'ios7-pricetag-outline', 
		label:'<i class="icon ion-ios7-pricetag-outline"></i> ios7-pricetag-outline'
	},
	{
		value: 'ios7-pricetags', 
		label:'<i class="icon ion-ios7-pricetags"></i> ios7-pricetags'
	},
	{
		value: 'ios7-pricetags-outline', 
		label:'<i class="icon ion-ios7-pricetags-outline"></i> ios7-pricetags-outline'
	},
	{
		value: 'ios7-printer', 
		label:'<i class="icon ion-ios7-printer"></i> ios7-printer'
	},
	{
		value: 'ios7-printer-outline', 
		label:'<i class="icon ion-ios7-printer-outline"></i> ios7-printer-outline'
	},
	{
		value: 'ios7-pulse', 
		label:'<i class="icon ion-ios7-pulse"></i> ios7-pulse'
	},
	{
		value: 'ios7-pulse-strong', 
		label:'<i class="icon ion-ios7-pulse-strong"></i> ios7-pulse-strong'
	},
	{
		value: 'ios7-rainy', 
		label:'<i class="icon ion-ios7-rainy"></i> ios7-rainy'
	},
	{
		value: 'ios7-rainy-outline', 
		label:'<i class="icon ion-ios7-rainy-outline"></i> ios7-rainy-outline'
	},
	{
		value: 'ios7-recording', 
		label:'<i class="icon ion-ios7-recording"></i> ios7-recording'
	},
	{
		value: 'ios7-recording-outline', 
		label:'<i class="icon ion-ios7-recording-outline"></i> ios7-recording-outline'
	},
	{
		value: 'ios7-redo', 
		label:'<i class="icon ion-ios7-redo"></i> ios7-redo'
	},
	{
		value: 'ios7-redo-outline', 
		label:'<i class="icon ion-ios7-redo-outline"></i> ios7-redo-outline'
	},
	{
		value: 'ios7-refresh', 
		label:'<i class="icon ion-ios7-refresh"></i> ios7-refresh'
	},
	{
		value: 'ios7-refresh-empty', 
		label:'<i class="icon ion-ios7-refresh-empty"></i> ios7-refresh-empty'
	},
	{
		value: 'ios7-refresh-outline', 
		label:'<i class="icon ion-ios7-refresh-outline"></i> ios7-refresh-outline'
	},
	{
		value: 'ios7-reload', 
		label:'<i class="icon ion-ios7-reload"></i> ios7-reload'
	},
	{
		value: 'ios7-reverse-camera', 
		label:'<i class="icon ion-ios7-reverse-camera"></i> ios7-reverse-camera'
	},
	{
		value: 'ios7-reverse-camera-outline', 
		label:'<i class="icon ion-ios7-reverse-camera-outline"></i> ios7-reverse-camera-outline'
	},
	{
		value: 'ios7-rewind', 
		label:'<i class="icon ion-ios7-rewind"></i> ios7-rewind'
	},
	{
		value: 'ios7-rewind-outline', 
		label:'<i class="icon ion-ios7-rewind-outline"></i> ios7-rewind-outline'
	},
	{
		value: 'ios7-search', 
		label:'<i class="icon ion-ios7-search"></i> ios7-search'
	},
	{
		value: 'ios7-search-strong', 
		label:'<i class="icon ion-ios7-search-strong"></i> ios7-search-strong'
	},
	{
		value: 'ios7-settings', 
		label:'<i class="icon ion-ios7-settings"></i> ios7-settings'
	},
	{
		value: 'ios7-settings-strong', 
		label:'<i class="icon ion-ios7-settings-strong"></i> ios7-settings-strong'
	},
	{
		value: 'ios7-shrink', 
		label:'<i class="icon ion-ios7-shrink"></i> ios7-shrink'
	},
	{
		value: 'ios7-skipbackward', 
		label:'<i class="icon ion-ios7-skipbackward"></i> ios7-skipbackward'
	},
	{
		value: 'ios7-skipbackward-outline', 
		label:'<i class="icon ion-ios7-skipbackward-outline"></i> ios7-skipbackward-outline'
	},
	{
		value: 'ios7-skipforward', 
		label:'<i class="icon ion-ios7-skipforward"></i> ios7-skipforward'
	},
	{
		value: 'ios7-skipforward-outline', 
		label:'<i class="icon ion-ios7-skipforward-outline"></i> ios7-skipforward-outline'
	},
	{
		value: 'ios7-snowy', 
		label:'<i class="icon ion-ios7-snowy"></i> ios7-snowy'
	},
	{
		value: 'ios7-speedometer', 
		label:'<i class="icon ion-ios7-speedometer"></i> ios7-speedometer'
	},
	{
		value: 'ios7-speedometer-outline', 
		label:'<i class="icon ion-ios7-speedometer-outline"></i> ios7-speedometer-outline'
	},
	{
		value: 'ios7-star', 
		label:'<i class="icon ion-ios7-star"></i> ios7-star'
	},
	{
		value: 'ios7-star-half', 
		label:'<i class="icon ion-ios7-star-half"></i> ios7-star-half'
	},
	{
		value: 'ios7-star-outline', 
		label:'<i class="icon ion-ios7-star-outline"></i> ios7-star-outline'
	},
	{
		value: 'ios7-stopwatch', 
		label:'<i class="icon ion-ios7-stopwatch"></i> ios7-stopwatch'
	},
	{
		value: 'ios7-stopwatch-outline', 
		label:'<i class="icon ion-ios7-stopwatch-outline"></i> ios7-stopwatch-outline'
	},
	{
		value: 'ios7-sunny', 
		label:'<i class="icon ion-ios7-sunny"></i> ios7-sunny'
	},
	{
		value: 'ios7-sunny-outline', 
		label:'<i class="icon ion-ios7-sunny-outline"></i> ios7-sunny-outline'
	},
	{
		value: 'ios7-telephone', 
		label:'<i class="icon ion-ios7-telephone"></i> ios7-telephone'
	},
	{
		value: 'ios7-telephone-outline', 
		label:'<i class="icon ion-ios7-telephone-outline"></i> ios7-telephone-outline'
	},
	{
		value: 'ios7-tennisball', 
		label:'<i class="icon ion-ios7-tennisball"></i> ios7-tennisball'
	},
	{
		value: 'ios7-tennisball-outline', 
		label:'<i class="icon ion-ios7-tennisball-outline"></i> ios7-tennisball-outline'
	},
	{
		value: 'ios7-thunderstorm', 
		label:'<i class="icon ion-ios7-thunderstorm"></i> ios7-thunderstorm'
	},
	{
		value: 'ios7-thunderstorm-outline', 
		label:'<i class="icon ion-ios7-thunderstorm-outline"></i> ios7-thunderstorm-outline'
	},
	{
		value: 'ios7-time', 
		label:'<i class="icon ion-ios7-time"></i> ios7-time'
	},
	{
		value: 'ios7-time-outline', 
		label:'<i class="icon ion-ios7-time-outline"></i> ios7-time-outline'
	},
	{
		value: 'ios7-timer', 
		label:'<i class="icon ion-ios7-timer"></i> ios7-timer'
	},
	{
		value: 'ios7-timer-outline', 
		label:'<i class="icon ion-ios7-timer-outline"></i> ios7-timer-outline'
	},
	{
		value: 'ios7-toggle', 
		label:'<i class="icon ion-ios7-toggle"></i> ios7-toggle'
	},
	{
		value: 'ios7-toggle-outline', 
		label:'<i class="icon ion-ios7-toggle-outline"></i> ios7-toggle-outline'
	},
	{
		value: 'ios7-trash', 
		label:'<i class="icon ion-ios7-trash"></i> ios7-trash'
	},
	{
		value: 'ios7-trash-outline', 
		label:'<i class="icon ion-ios7-trash-outline"></i> ios7-trash-outline'
	},
	{
		value: 'ios7-undo', 
		label:'<i class="icon ion-ios7-undo"></i> ios7-undo'
	},
	{
		value: 'ios7-undo-outline', 
		label:'<i class="icon ion-ios7-undo-outline"></i> ios7-undo-outline'
	},
	{
		value: 'ios7-unlocked', 
		label:'<i class="icon ion-ios7-unlocked"></i> ios7-unlocked'
	},
	{
		value: 'ios7-unlocked-outline', 
		label:'<i class="icon ion-ios7-unlocked-outline"></i> ios7-unlocked-outline'
	},
	{
		value: 'ios7-upload', 
		label:'<i class="icon ion-ios7-upload"></i> ios7-upload'
	},
	{
		value: 'ios7-upload-outline', 
		label:'<i class="icon ion-ios7-upload-outline"></i> ios7-upload-outline'
	},
	{
		value: 'ios7-videocam', 
		label:'<i class="icon ion-ios7-videocam"></i> ios7-videocam'
	},
	{
		value: 'ios7-videocam-outline', 
		label:'<i class="icon ion-ios7-videocam-outline"></i> ios7-videocam-outline'
	},
	{
		value: 'ios7-volume-high', 
		label:'<i class="icon ion-ios7-volume-high"></i> ios7-volume-high'
	},
	{
		value: 'ios7-volume-low', 
		label:'<i class="icon ion-ios7-volume-low"></i> ios7-volume-low'
	},
	{
		value: 'ios7-wineglass', 
		label:'<i class="icon ion-ios7-wineglass"></i> ios7-wineglass'
	},
	{
		value: 'ios7-wineglass-outline', 
		label:'<i class="icon ion-ios7-wineglass-outline"></i> ios7-wineglass-outline'
	},
	{
		value: 'ios7-world', 
		label:'<i class="icon ion-ios7-world"></i> ios7-world'
	},
	{
		value: 'ios7-world-outline', 
		label:'<i class="icon ion-ios7-world-outline"></i> ios7-world-outline'
	},
	{
		value: 'ipad', 
		label:'<i class="icon ion-ipad"></i> ipad'
	},
	{
		value: 'iphone', 
		label:'<i class="icon ion-iphone"></i> iphone'
	},
	{
		value: 'ipod', 
		label:'<i class="icon ion-ipod"></i> ipod'
	},
	{
		value: 'jet', 
		label:'<i class="icon ion-jet"></i> jet'
	},
	{
		value: 'key', 
		label:'<i class="icon ion-key"></i> key'
	},
	{
		value: 'knife', 
		label:'<i class="icon ion-knife"></i> knife'
	},
	{
		value: 'laptop', 
		label:'<i class="icon ion-laptop"></i> laptop'
	},
	{
		value: 'leaf', 
		label:'<i class="icon ion-leaf"></i> leaf'
	},
	{
		value: 'levels', 
		label:'<i class="icon ion-levels"></i> levels'
	},
	{
		value: 'lightbulb', 
		label:'<i class="icon ion-lightbulb"></i> lightbulb'
	},
	{
		value: 'link', 
		label:'<i class="icon ion-link"></i> link'
	},
	{
		value: 'load-a', 
		label:'<i class="icon ion-load-a"></i> load-a'
	},
	{
		value: 'load-b', 
		label:'<i class="icon ion-load-b"></i> load-b'
	},
	{
		value: 'load-c', 
		label:'<i class="icon ion-load-c"></i> load-c'
	},
	{
		value: 'load-d', 
		label:'<i class="icon ion-load-d"></i> load-d'
	},
	{
		value: 'location', 
		label:'<i class="icon ion-location"></i> location'
	},
	{
		value: 'locked', 
		label:'<i class="icon ion-locked"></i> locked'
	},
	{
		value: 'log-in', 
		label:'<i class="icon ion-log-in"></i> log-in'
	},
	{
		value: 'log-out', 
		label:'<i class="icon ion-log-out"></i> log-out'
	},
	{
		value: 'loop', 
		label:'<i class="icon ion-loop"></i> loop'
	},
	{
		value: 'magnet', 
		label:'<i class="icon ion-magnet"></i> magnet'
	},
	{
		value: 'male', 
		label:'<i class="icon ion-male"></i> male'
	},
	{
		value: 'man', 
		label:'<i class="icon ion-man"></i> man'
	},
	{
		value: 'map', 
		label:'<i class="icon ion-map"></i> map'
	},
	{
		value: 'medkit', 
		label:'<i class="icon ion-medkit"></i> medkit'
	},
	{
		value: 'merge', 
		label:'<i class="icon ion-merge"></i> merge'
	},
	{
		value: 'mic-a', 
		label:'<i class="icon ion-mic-a"></i> mic-a'
	},
	{
		value: 'mic-b', 
		label:'<i class="icon ion-mic-b"></i> mic-b'
	},
	{
		value: 'mic-c', 
		label:'<i class="icon ion-mic-c"></i> mic-c'
	},
	{
		value: 'minus', 
		label:'<i class="icon ion-minus"></i> minus'
	},
	{
		value: 'minus-circled', 
		label:'<i class="icon ion-minus-circled"></i> minus-circled'
	},
	{
		value: 'minus-round', 
		label:'<i class="icon ion-minus-round"></i> minus-round'
	},
	{
		value: 'model-s', 
		label:'<i class="icon ion-model-s"></i> model-s'
	},
	{
		value: 'monitor', 
		label:'<i class="icon ion-monitor"></i> monitor'
	},
	{
		value: 'more', 
		label:'<i class="icon ion-more"></i> more'
	},
	{
		value: 'mouse', 
		label:'<i class="icon ion-mouse"></i> mouse'
	},
	{
		value: 'music-note', 
		label:'<i class="icon ion-music-note"></i> music-note'
	},
	{
		value: 'navicon', 
		label:'<i class="icon ion-navicon"></i> navicon'
	},
	{
		value: 'navicon-round', 
		label:'<i class="icon ion-navicon-round"></i> navicon-round'
	},
	{
		value: 'navigate', 
		label:'<i class="icon ion-navigate"></i> navigate'
	},
	{
		value: 'network', 
		label:'<i class="icon ion-network"></i> network'
	},
	{
		value: 'no-smoking', 
		label:'<i class="icon ion-no-smoking"></i> no-smoking'
	},
	{
		value: 'nuclear', 
		label:'<i class="icon ion-nuclear"></i> nuclear'
	},
	{
		value: 'outlet', 
		label:'<i class="icon ion-outlet"></i> outlet'
	},
	{
		value: 'paper-airplane', 
		label:'<i class="icon ion-paper-airplane"></i> paper-airplane'
	},
	{
		value: 'paperclip', 
		label:'<i class="icon ion-paperclip"></i> paperclip'
	},
	{
		value: 'pause', 
		label:'<i class="icon ion-pause"></i> pause'
	},
	{
		value: 'person', 
		label:'<i class="icon ion-person"></i> person'
	},
	{
		value: 'person-add', 
		label:'<i class="icon ion-person-add"></i> person-add'
	},
	{
		value: 'person-stalker', 
		label:'<i class="icon ion-person-stalker"></i> person-stalker'
	},
	{
		value: 'pie-graph', 
		label:'<i class="icon ion-pie-graph"></i> pie-graph'
	},
	{
		value: 'pin', 
		label:'<i class="icon ion-pin"></i> pin'
	},
	{
		value: 'pinpoint', 
		label:'<i class="icon ion-pinpoint"></i> pinpoint'
	},
	{
		value: 'pizza', 
		label:'<i class="icon ion-pizza"></i> pizza'
	},
	{
		value: 'plane', 
		label:'<i class="icon ion-plane"></i> plane'
	},
	{
		value: 'planet', 
		label:'<i class="icon ion-planet"></i> planet'
	},
	{
		value: 'play', 
		label:'<i class="icon ion-play"></i> play'
	},
	{
		value: 'playstation', 
		label:'<i class="icon ion-playstation"></i> playstation'
	},
	{
		value: 'plus', 
		label:'<i class="icon ion-plus"></i> plus'
	},
	{
		value: 'plus-circled', 
		label:'<i class="icon ion-plus-circled"></i> plus-circled'
	},
	{
		value: 'plus-round', 
		label:'<i class="icon ion-plus-round"></i> plus-round'
	},
	{
		value: 'podium', 
		label:'<i class="icon ion-podium"></i> podium'
	},
	{
		value: 'pound', 
		label:'<i class="icon ion-pound"></i> pound'
	},
	{
		value: 'power', 
		label:'<i class="icon ion-power"></i> power'
	},
	{
		value: 'pricetag', 
		label:'<i class="icon ion-pricetag"></i> pricetag'
	},
	{
		value: 'pricetags', 
		label:'<i class="icon ion-pricetags"></i> pricetags'
	},
	{
		value: 'printer', 
		label:'<i class="icon ion-printer"></i> printer'
	},
	{
		value: 'pull-request', 
		label:'<i class="icon ion-pull-request"></i> pull-request'
	},
	{
		value: 'qr-scanner', 
		label:'<i class="icon ion-qr-scanner"></i> qr-scanner'
	},
	{
		value: 'quote', 
		label:'<i class="icon ion-quote"></i> quote'
	},
	{
		value: 'radio-waves', 
		label:'<i class="icon ion-radio-waves"></i> radio-waves'
	},
	{
		value: 'record', 
		label:'<i class="icon ion-record"></i> record'
	},
	{
		value: 'refresh', 
		label:'<i class="icon ion-refresh"></i> refresh'
	},
	{
		value: 'reply', 
		label:'<i class="icon ion-reply"></i> reply'
	},
	{
		value: 'reply-all', 
		label:'<i class="icon ion-reply-all"></i> reply-all'
	},
	{
		value: 'ribbon-a', 
		label:'<i class="icon ion-ribbon-a"></i> ribbon-a'
	},
	{
		value: 'ribbon-b', 
		label:'<i class="icon ion-ribbon-b"></i> ribbon-b'
	},
	{
		value: 'sad', 
		label:'<i class="icon ion-sad"></i> sad'
	},
	{
		value: 'scissors', 
		label:'<i class="icon ion-scissors"></i> scissors'
	},
	{
		value: 'search', 
		label:'<i class="icon ion-search"></i> search'
	},
	{
		value: 'settings', 
		label:'<i class="icon ion-settings"></i> settings'
	},
	{
		value: 'share', 
		label:'<i class="icon ion-share"></i> share'
	},
	{
		value: 'shuffle', 
		label:'<i class="icon ion-shuffle"></i> shuffle'
	},
	{
		value: 'skip-backward', 
		label:'<i class="icon ion-skip-backward"></i> skip-backward'
	},
	{
		value: 'skip-forward', 
		label:'<i class="icon ion-skip-forward"></i> skip-forward'
	},
	{
		value: 'social-android', 
		label:'<i class="icon ion-social-android"></i> social-android'
	},
	{
		value: 'social-android-outline', 
		label:'<i class="icon ion-social-android-outline"></i> social-android-outline'
	},
	{
		value: 'social-apple', 
		label:'<i class="icon ion-social-apple"></i> social-apple'
	},
	{
		value: 'social-apple-outline', 
		label:'<i class="icon ion-social-apple-outline"></i> social-apple-outline'
	},
	{
		value: 'social-bitcoin', 
		label:'<i class="icon ion-social-bitcoin"></i> social-bitcoin'
	},
	{
		value: 'social-bitcoin-outline', 
		label:'<i class="icon ion-social-bitcoin-outline"></i> social-bitcoin-outline'
	},
	{
		value: 'social-buffer', 
		label:'<i class="icon ion-social-buffer"></i> social-buffer'
	},
	{
		value: 'social-buffer-outline', 
		label:'<i class="icon ion-social-buffer-outline"></i> social-buffer-outline'
	},
	{
		value: 'social-designernews', 
		label:'<i class="icon ion-social-designernews"></i> social-designernews'
	},
	{
		value: 'social-designernews-outline', 
		label:'<i class="icon ion-social-designernews-outline"></i> social-designernews-outline'
	},
	{
		value: 'social-dribbble', 
		label:'<i class="icon ion-social-dribbble"></i> social-dribbble'
	},
	{
		value: 'social-dribbble-outline', 
		label:'<i class="icon ion-social-dribbble-outline"></i> social-dribbble-outline'
	},
	{
		value: 'social-dropbox', 
		label:'<i class="icon ion-social-dropbox"></i> social-dropbox'
	},
	{
		value: 'social-dropbox-outline', 
		label:'<i class="icon ion-social-dropbox-outline"></i> social-dropbox-outline'
	},
	{
		value: 'social-facebook', 
		label:'<i class="icon ion-social-facebook"></i> social-facebook'
	},
	{
		value: 'social-facebook-outline', 
		label:'<i class="icon ion-social-facebook-outline"></i> social-facebook-outline'
	},
	{
		value: 'social-foursquare', 
		label:'<i class="icon ion-social-foursquare"></i> social-foursquare'
	},
	{
		value: 'social-foursquare-outline', 
		label:'<i class="icon ion-social-foursquare-outline"></i> social-foursquare-outline'
	},
	{
		value: 'social-freebsd-devil', 
		label:'<i class="icon ion-social-freebsd-devil"></i> social-freebsd-devil'
	},
	{
		value: 'social-github', 
		label:'<i class="icon ion-social-github"></i> social-github'
	},
	{
		value: 'social-github-outline', 
		label:'<i class="icon ion-social-github-outline"></i> social-github-outline'
	},
	{
		value: 'social-google', 
		label:'<i class="icon ion-social-google"></i> social-google'
	},
	{
		value: 'social-google-outline', 
		label:'<i class="icon ion-social-google-outline"></i> social-google-outline'
	},
	{
		value: 'social-googleplus', 
		label:'<i class="icon ion-social-googleplus"></i> social-googleplus'
	},
	{
		value: 'social-googleplus-outline', 
		label:'<i class="icon ion-social-googleplus-outline"></i> social-googleplus-outline'
	},
	{
		value: 'social-hackernews', 
		label:'<i class="icon ion-social-hackernews"></i> social-hackernews'
	},
	{
		value: 'social-hackernews-outline', 
		label:'<i class="icon ion-social-hackernews-outline"></i> social-hackernews-outline'
	},
	{
		value: 'social-instagram', 
		label:'<i class="icon ion-social-instagram"></i> social-instagram'
	},
	{
		value: 'social-instagram-outline', 
		label:'<i class="icon ion-social-instagram-outline"></i> social-instagram-outline'
	},
	{
		value: 'social-linkedin', 
		label:'<i class="icon ion-social-linkedin"></i> social-linkedin'
	},
	{
		value: 'social-linkedin-outline', 
		label:'<i class="icon ion-social-linkedin-outline"></i> social-linkedin-outline'
	},
	{
		value: 'social-pinterest', 
		label:'<i class="icon ion-social-pinterest"></i> social-pinterest'
	},
	{
		value: 'social-pinterest-outline', 
		label:'<i class="icon ion-social-pinterest-outline"></i> social-pinterest-outline'
	},
	{
		value: 'social-reddit', 
		label:'<i class="icon ion-social-reddit"></i> social-reddit'
	},
	{
		value: 'social-reddit-outline', 
		label:'<i class="icon ion-social-reddit-outline"></i> social-reddit-outline'
	},
	{
		value: 'social-rss', 
		label:'<i class="icon ion-social-rss"></i> social-rss'
	},
	{
		value: 'social-rss-outline', 
		label:'<i class="icon ion-social-rss-outline"></i> social-rss-outline'
	},
	{
		value: 'social-skype', 
		label:'<i class="icon ion-social-skype"></i> social-skype'
	},
	{
		value: 'social-skype-outline', 
		label:'<i class="icon ion-social-skype-outline"></i> social-skype-outline'
	},
	{
		value: 'social-tumblr', 
		label:'<i class="icon ion-social-tumblr"></i> social-tumblr'
	},
	{
		value: 'social-tumblr-outline', 
		label:'<i class="icon ion-social-tumblr-outline"></i> social-tumblr-outline'
	},
	{
		value: 'social-tux', 
		label:'<i class="icon ion-social-tux"></i> social-tux'
	},
	{
		value: 'social-twitter', 
		label:'<i class="icon ion-social-twitter"></i> social-twitter'
	},
	{
		value: 'social-twitter-outline', 
		label:'<i class="icon ion-social-twitter-outline"></i> social-twitter-outline'
	},
	{
		value: 'social-usd', 
		label:'<i class="icon ion-social-usd"></i> social-usd'
	},
	{
		value: 'social-usd-outline', 
		label:'<i class="icon ion-social-usd-outline"></i> social-usd-outline'
	},
	{
		value: 'social-vimeo', 
		label:'<i class="icon ion-social-vimeo"></i> social-vimeo'
	},
	{
		value: 'social-vimeo-outline', 
		label:'<i class="icon ion-social-vimeo-outline"></i> social-vimeo-outline'
	},
	{
		value: 'social-windows', 
		label:'<i class="icon ion-social-windows"></i> social-windows'
	},
	{
		value: 'social-windows-outline', 
		label:'<i class="icon ion-social-windows-outline"></i> social-windows-outline'
	},
	{
		value: 'social-wordpress', 
		label:'<i class="icon ion-social-wordpress"></i> social-wordpress'
	},
	{
		value: 'social-wordpress-outline', 
		label:'<i class="icon ion-social-wordpress-outline"></i> social-wordpress-outline'
	},
	{
		value: 'social-yahoo', 
		label:'<i class="icon ion-social-yahoo"></i> social-yahoo'
	},
	{
		value: 'social-yahoo-outline', 
		label:'<i class="icon ion-social-yahoo-outline"></i> social-yahoo-outline'
	},
	{
		value: 'social-youtube', 
		label:'<i class="icon ion-social-youtube"></i> social-youtube'
	},
	{
		value: 'social-youtube-outline', 
		label:'<i class="icon ion-social-youtube-outline"></i> social-youtube-outline'
	},
	{
		value: 'speakerphone', 
		label:'<i class="icon ion-speakerphone"></i> speakerphone'
	},
	{
		value: 'speedometer', 
		label:'<i class="icon ion-speedometer"></i> speedometer'
	},
	{
		value: 'spoon', 
		label:'<i class="icon ion-spoon"></i> spoon'
	},
	{
		value: 'star', 
		label:'<i class="icon ion-star"></i> star'
	},
	{
		value: 'stats-bars', 
		label:'<i class="icon ion-stats-bars"></i> stats-bars'
	},
	{
		value: 'steam', 
		label:'<i class="icon ion-steam"></i> steam'
	},
	{
		value: 'stop', 
		label:'<i class="icon ion-stop"></i> stop'
	},
	{
		value: 'thermometer', 
		label:'<i class="icon ion-thermometer"></i> thermometer'
	},
	{
		value: 'thumbsdown', 
		label:'<i class="icon ion-thumbsdown"></i> thumbsdown'
	},
	{
		value: 'thumbsup', 
		label:'<i class="icon ion-thumbsup"></i> thumbsup'
	},
	{
		value: 'toggle', 
		label:'<i class="icon ion-toggle"></i> toggle'
	},
	{
		value: 'toggle-filled', 
		label:'<i class="icon ion-toggle-filled"></i> toggle-filled'
	},
	{
		value: 'trash-a', 
		label:'<i class="icon ion-trash-a"></i> trash-a'
	},
	{
		value: 'trash-b', 
		label:'<i class="icon ion-trash-b"></i> trash-b'
	},
	{
		value: 'trophy', 
		label:'<i class="icon ion-trophy"></i> trophy'
	},
	{
		value: 'umbrella', 
		label:'<i class="icon ion-umbrella"></i> umbrella'
	},
	{
		value: 'university', 
		label:'<i class="icon ion-university"></i> university'
	},
	{
		value: 'unlocked', 
		label:'<i class="icon ion-unlocked"></i> unlocked'
	},
	{
		value: 'upload', 
		label:'<i class="icon ion-upload"></i> upload'
	},
	{
		value: 'usb', 
		label:'<i class="icon ion-usb"></i> usb'
	},
	{
		value: 'videocamera', 
		label:'<i class="icon ion-videocamera"></i> videocamera'
	},
	{
		value: 'volume-high', 
		label:'<i class="icon ion-volume-high"></i> volume-high'
	},
	{
		value: 'volume-low', 
		label:'<i class="icon ion-volume-low"></i> volume-low'
	},
	{
		value: 'volume-medium', 
		label:'<i class="icon ion-volume-medium"></i> volume-medium'
	},
	{
		value: 'volume-mute', 
		label:'<i class="icon ion-volume-mute"></i> volume-mute'
	},
	{
		value: 'wand', 
		label:'<i class="icon ion-wand"></i> wand'
	},
	{
		value: 'waterdrop', 
		label:'<i class="icon ion-waterdrop"></i> waterdrop'
	},
	{
		value: 'wifi', 
		label:'<i class="icon ion-wifi"></i> wifi'
	},
	{
		value: 'wineglass', 
		label:'<i class="icon ion-wineglass"></i> wineglass'
	},
	{
		value: 'woman', 
		label:'<i class="icon ion-woman"></i> woman'
	},
	{
		value: 'wrench', 
		label:'<i class="icon ion-wrench"></i> wrench'
	},
	{
		value: 'xbox', 
		label:'<i class="icon ion-xbox"></i> xbox'
	},
]
);
