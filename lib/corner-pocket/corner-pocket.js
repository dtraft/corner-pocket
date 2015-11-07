angular.module("corner-pocket", []).factory('cornerPocket', function($q, $parse, $rootScope) {
    var db;
    //define pouchDoc object - contains save and delete functions w/syncing capabilities
    function PouchDoc(doc, isRemote, $scope) {
        //let's check and be sure we're actually being passed on object
        if (typeof doc != 'object') {
            throw new Error("need to start with an object, if you want to use an Id, try $ngPouch.pouchDocFromId");
            return;
        }
        var self = this;
        angular.extend(self, doc);
        //bind the event handlers to this object, so the 'this' in the update function is a reference to the doc itself.
        _.bindAll(self, 'onUpdate');
        self.remote = isRemote;
        //no need to do much right now, just start listening for changes to this object.
        self.stopListening = $rootScope.$on("pdb-updated", self.onUpdate);
        if ($scope) {
            $scope.$on("$destroy", self.stopListening);
        }
    }
    //assign functions (defined above) to this object
    PouchDoc.prototype.save = function(options) {
        var self = this;
        var deferred = $q.defer();
        var doc = angular.copy(self);
        //delete any functions on this object - necessary because they include references (which can't be saved by pouchDB)
        var functions = _.functions(self);
        //console.log(functions);
        for (var i = 0; i < functions.length; i++) {
            delete doc[functions[i]];
        }
        var now = new Date();
        doc.updated = now.toISOString();
        //now save it back to the db.
        db.put(doc, options, function(err, response) {
            if (err) {
                deferred.reject(err); //reject if there's a problem
            } else {
                deferred.resolve(response);
            }
        });
        return deferred.promise;
    };
    PouchDoc.prototype.remove = function(options) {
        //TODO
        var self = this;
        var deferred = $q.defer();
        var doc = angular.copy(self);
        //delete any functions on this object - necessary because they include references (which can't be saved by pouchDB)
        var functions = _.functions(self);
        //console.log(functions);
        for (var i = 0; i < functions.length; i++) {
            delete doc[functions[i]];
        }
        var now = new Date();
        doc.updated = now.toISOString();
        doc._deleted = true;
        //now remove it from the db.
        db.put(doc, options, function(err, response) {
            if (err) {
                deferred.reject(err); //reject if there's a problem
            } else {
                deferred.resolve(response);
            }
        });
        return deferred.promise;
    };
    PouchDoc.prototype.onUpdate = function(event, change) {
        var self = this;
        //stop firing if this doesn't effect this doc
        if (self._id !== change.id) {
            return;
        }
        $rootScope.$apply(function() {
            //update this object "in-place".  Preserving reference to the scope object, just adjusting its values to match change.doc
            //the only thing we shouldn't change is doc.remote
            var remote = self.remote;		
            extend(self, change.doc);
            self.remote = remote;
        });
    };
    //define pouch collection object
    function PouchCollection(docs, map, options, $scope) {
        var self = this;
        self.docs = docs;
        for (var i = 0; i < self.docs.length; i++) {
            self.docs[i] = new PouchDoc(self.docs[i], options.isRemote, $scope);
        }
        self.emit = function(key, value) {
            self.mapResults.push({
                key: key,
                value: value
            });
        }
        self.updateCollection = function(change) {
            self.mapResults = [];
            map(change.doc, self.emit);
            //check the result
            if (self.mapResults.length > 0) { //because create could result in more than one row
                //check to makes sure we don't have this one already
                var ids = _.pluck(self.docs, "_id");
                if(ids.indexOf(change.id) !== -1){
                    return;//we've already got this doc in the collection, pouchDoc will handle update event
                }
                //check each new result to ensure it meets the conditions
                for (var i = 0; i < self.mapResults.length; i++) {
                    var result = self.mapResults[i];
                    var include = true;
                    if (options.startkey && options.endkey) {
                        //various key types
                        if (result.key instanceof Array) {
                            console.log("key is array");
                            for (var w = 0; w < result.key.length; w++) {
                                var key = result.key[w];
                                var startKey = options.startkey[w];
                                var endKey = options.endkey[w];
                                if (key < startKey || key > endKey) {
                                    include = false;
                                    break;
                                }
                            }
                        } else if (result.key instanceof Object) {
                            console.log("key is object");
                            include = false;
                        } else if (typeof result.key === 'string') {
                            console.log("key is string");
                            include = false;
                        }
                    }
                    if (include) {
                        //add new row
                        self.docs.push(new PouchDoc(change.doc, options.isRemote, $scope));
                        console.log("added new Row!");
                    }
                }
            }else{
                //no results emitted, lets remove any docs with this id that were already in our collection
                for (var i = self.docs.length - 1; i >= 0; i--) {
                    if (self.docs[i]._id === change.id) {
                        self.docs.splice(i, 1);
                        console.log("deleted row");
                    }
                }
            }
            delete self.mapResults;
        };
            
        //this will be called on input or deletion
        self.onCollectionUpdate = function(event, change) {
            var self = this;
            if(event.name === "pdb-deleted"){
                $rootScope.$apply(function(){
                    for (var i = self.docs.length - 1; i >= 0; i--) {
                        if (self.docs[i]._id === change.id) {
                            self.docs.splice(i, 1);
                            console.log("deleted row");
                        }
                    }
                });
            }else{
                $rootScope.$apply(function(){
                    self.updateCollection(change);
                }); 
            }          
        };
        //bind the event handlers to this object, so the 'this' in the update function is a reference to the doc itself.
        _.bindAll(self, 'onCollectionUpdate');
        //start listening for events						
        var createdUnbind = $rootScope.$on("pdb-created", self.onCollectionUpdate);
        var deletedUnbind = $rootScope.$on("pdb-deleted", self.onCollectionUpdate);
        var updatedUnbind = $rootScope.$on("pdb-updated", self.onCollectionUpdate);	
        if ($scope) {
            //remove event listeners on scope destroy
            $scope.$on('$destroy', function() {
                createdUnbind();
                deletedUnbind();
                updatedUnbind();
            });
        }
    }
    //here's where we actually return the $ngPouch singleton with associated 'static' methods and properties
    return {
        //start up db
        init: function(name, options) {
            if (this.changes) { //we've already initialized a db, lets turn off listening for that one.
                this.changes.cancel();
                console.log("---stop listening to " + this.name + "---");
            }
            this.name = name;
            db = new PouchDB(name, options);
            this.db = db;
            if(options){
                this.isRemote = options.isRemote;
            }
            var ngPouch = this;
            //start listening to changes
            var changes = db.changes({
                live: true,
                include_docs: true,
                since: 'now'
            }).on('change', function(change) {
                // handle change
                console.log("CHANGE");
                console.log(change);
                if (change.doc._deleted) {
                    //console.log("DELETED - " + change.id);
                    $rootScope.$emit("pdb-deleted", change, db);
                } else if (change.doc._rev.split('-')[0] === '1') {
                    //console.log("CREATED - " + change.id);
                    $rootScope.$emit("pdb-created", change, db);
                } else {
                    //console.log("UPDATED - " + change.id);
                    $rootScope.$emit("pdb-updated", change);
                }
            }).on('complete', function(info) {
              // changes() was canceled
            }).on('error', function (err) {
              console.log(err);
            });
            ngPouch.changes = changes;
            this.listening = true;
            console.log("--listening to changes in db: " + name);
        },
        //function to take an object and transform into the mighty PouchDoc
        doc: function(doc, $scope) { //pass $scope to watch this doc and save automatically on change.	
            var deferred = $q.defer();
            var ngPouch = this;
            var db = ngPouch.db;
            //Save to DB if doc isn't already in the PouchDB data store.  Indicated by absense of _id or _rev.
            if (typeof doc === 'object' && (!doc._id || !doc._rev)) {
                //now it's ready.  Post it to the database.
                var now = new Date();
                doc.created = now.toISOString();
                doc.updated = now.toISOString();
                doc.remote = this.isRemote;
                //delete any functions on this object - necessary because they include references (which can't be saved by pouchDB)
                var functions = _.functions(doc);
                //console.log(functions);
                for (var i = 0; i < functions.length; i++) {
                    delete doc[functions[i]];
                }
                console.log("--corner--");
                console.log(doc);
                db.post(doc, function(err, response) {
                    //add these back into the mix so the doc has it's id/rev properties
                    doc._id = response.id;
                    doc._rev = response.rev;
                    console.log(doc);
                    deferred.resolve(new PouchDoc(doc, ngPouch.isRemote, $scope)); //return reference to the doc back to caller
                });
            } else {
                deferred.resolve(new PouchDoc(doc, ngPouch.isRemote, $scope)); //return reference to the doc back to caller
            }
            return deferred.promise;
        },
        //function to take an Id, retieve the doc, and transform it into the mighty PouchDoc
        docFromId: function(Id, $scope) { //pass $scope to watch this doc and save automatically on change.
            //let's check and be sure we're actually being passed on string
            if (typeof Id != 'string') {
                throw new Error("need to start with a string Id");
                return;
            }
            //get ref to PouchDB
            var ngPouch = this;
            var db = ngPouch.db;
            //this will be an async function
            var deferred = $q.defer();
            //let's get the doc
            db.get(Id, function(err, doc) {
                //deferred.notify("here");
                if (err) {
                    deferred.reject(err);
                } else {
                    deferred.resolve(new PouchDoc(doc, ngPouch.isRemote, $scope));
                }
            });
            return deferred.promise; //return promise to caller
        },
        mapCollection: function(query, options, passedMap) {
            //let's do the async thing for this bad bear as well
            var deferred = $q.defer();
            //get ref to singleton object & pouchDB instance
            var ngPouch = this;
            var db = ngPouch.db;
            //reset params if needed
            if (typeof options === 'function') {
                passedMap = options;
                options = {};
            } else if (!options) {
                options = {};
            }
            //default to include docs
            options.include_docs = true;
            options.isRemote = ngPouch.isRemote;
            var map;
            //run query function
            var runQuery = function() {
                    db.query(query, options, function(err, response) {
                        if (err) {
                            deferred.reject(err);
                        } else {
                            deferred.resolve(new PouchCollection(_.pluck(response.rows, "doc"), map, options));
                        }
                    });
                }
                //for temp views, etc.
            if (typeof query === 'function') {
                map = query;
                runQuery();
            }
            //get map function if we're using a design doc
            else if (typeof query === "string") {
                if (passedMap) {
                    map = passedMap;
                    runQuery();
                } else {
                    var split = query.split("/");
                    if (split.length > 1) {
                        db.get("_design/" + split[0]).then(function(doc) {
                            var stringMapFn = doc.views[split[1]].map;
                            var start = stringMapFn.indexOf("{") + 1;
                            var count = stringMapFn.length - start - 1;
                            var stripped = stringMapFn.substr(start, count)
                            map = new Function("doc", "emit", stripped);
                            runQuery();
                        });
                    } else { //not sure how to handle when only a view is defined
                    }
                }
            }
            return deferred.promise;
        }
    }
});
//utility function to start listening on scope.  Returns the unbind function 
function watchDocInScope(doc, $scope, db) {
    return $scope.$watch(function() {
        return doc;
    }, function(newValue, oldValue) {
        //console.log(newValue === oldValue);
        if (newValue === oldValue) { //don't want to react to initialization
            return;
        }
        if (newValue._rev && oldValue._rev) {
            //see if it's only the revision has changed.  This will stop propagation when we write the _rev back to the scope after save.
            if (!angular.equals(_.omit(newValue, '_rev'), _.omit(oldValue, '_rev'))) {
                console.log("OLD");
                console.log(_.omit(oldValue, '_rev'));
                console.log("--NEW--");
                console.log(_.omit(newValue, '_rev'));
                //delete any functions on this object - necessary because they include references (which can't be saved by pouchDB)
                var toSave = angular.copy(newValue);
                var functions = _.functions(toSave);
                for (var i = 0; i < functions.length; i++) {
                    delete toSave[functions[i]];
                }
                //put it back to the DB.  Don't worry, the new _rev will be written back to the scope object via the "update" event
                db.put(toSave, function(err, response) {
                    //console.log(response);
                    if (err) {
                        //console.log(err);
                    }
                });
            }
        }
    }, true);
}
//helper function to run the "update in place"
function extend(_a, _b, remove) {
    remove = remove === undefined ? false : remove;
    var a_traversed = [],
        b_traversed = [];

    function _extend(a, b) {
        //if (a_traversed.indexOf(a) == -1 && b_traversed.indexOf(b) == -1){
        a_traversed.push(a);
        b_traversed.push(b);
        if (a instanceof Array) {
            for (var i = 0; i < b.length; i++) {
                if (a[i]) { // If element exists, keep going recursive so we don't lose the references
                    a[i] = _extend(a[i], b[i]);
                } else {
                    a[i] = b[i]; // Object doesn't exist, no reference to lose							
                }
            }
            if (remove && b.length < a.length) { // Do we have fewer elements in the new object?
                a.splice(b.length, a.length - b.length);
            }
        } else if (a instanceof Object) {
            for (var x in b) {
                if (a.hasOwnProperty(x)) {
                    a[x] = _extend(a[x], b[x]);
                } else {
                    a[x] = b[x];
                }
            }
            if (remove)
                for (var x in a) {
                    if (!b.hasOwnProperty(x) && typeof a[x] != "function" && x.substring(0, 2) != "$$") {
                        //console.log("Deleting: " + x);
                        delete a[x];
                    }
                }
        } else {
            return b;
        }
        return a;
        /*}else{
			//console.log("a");
			//console.log(a);
			//console.log("b");
			//console.log(b);
		}    */
    }
    _extend(_a, _b);
}
