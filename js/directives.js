'use strict';
/* Directives */
angular.module('myApp.directives', []).directive('focus', function() {
    return {
        restrict: 'A',
        link: function(scope, element, attr) {
            scope.$watch(attr.focus, function(n, o) {
                if (n !== 0 && n) {
                    element[0].focus();
                    element[0].select();
                }
            });
        }
    };
}).directive('ngEnter', function() {
    return function(scope, element, attrs) {
        var notOpen = false;
        element.bind("keyup", function(event) {
            var dropdown = element.next('.dropdown-menu');
            if (dropdown[0]) {
                notOpen = $(dropdown[0]).css("display") === 'none';
            } else {
                notOpen = false;
            }
        });
        element.bind("keydown", function(event) {
            if (event.which === 13 && notOpen) {
                scope.$apply(function() {
                    scope.$eval(attrs.ngEnter);
                });
                event.preventDefault();
            }
        });
    };
}).directive('ngEnterAlways', function() {
    return function(scope, element, attrs) {        
        element.bind("keydown", function(event) {
            if (event.which === 13) {
                scope.$apply(function() {
                    scope.$eval(attrs.ngEnterAlways);
                });
                event.preventDefault();
            }
        });
    };
}).directive('onsiteInputs', function($parse, $modal) {
    return {
        restrict: 'E',
        scope: {
            component: '=',
            project: '=',
            schema: '=',
            components: '=',
            setStatus: '&setStatus',
            save: '&saveComponent',
            isPreview: '@'
        },
        templateUrl: 'partials/inputs.html',
        controller: function($scope) {
            console.log("directive scope");
            console.log($scope);
            //set up view object for misc. view states  
            $scope.view = {};
            //VIEW OPERATIONS  
            $scope.onInputFocus = function(value) {
                console.log("focus");
                $scope.view.activeInputValue = value;
            };
            $scope.onInputBlur = function(value, input, isSelect) {
                console.log("blur");
                if ($scope.view.activeInputValue !== value) {
                    $scope.parentObject.state[input.alias].userValue = true;
                    if(!isSelect){
                        $scope.digestValues();
                        $scope.save();
                    }
                } else {
                    $scope.setStatus({
                        status: "Saved!"
                    });
                }
                $scope.view.activeInputValue = null;
            };
            $scope.onInputChange = function(value, selectInput) {
                console.log("change");
                if ($scope.view.activeInputValue !== value && !selectInput) {
                    $scope.setStatus({
                        status: "Unsaved"
                    });
                } else {
                    $scope.setStatus({
                        status: "Saved!"
                    });
                }
                if (selectInput) {
                    console.log('run!');
                    $scope.parentObject.state[selectInput.alias].userValue = true;
                    $scope.digestValues();
                    $scope.save();
                    console.log($scope.parentObject.values[selectInput.alias]);
                    //$scope.view.activeInputValue = value;
                    console.log($scope.parentObject.values[selectInput.alias]);
                }
            }
			 $scope.$watch('component', function(newValue, oldValue) {
				if (newValue === oldValue) {
					return;
				}
				console.log('New Component');
				if (newValue) {
					$scope.parentObject = $scope.schema.libraryType === 'Descriptive' ? $scope.project : $scope.component;
					$scope.digestValues();                    
				}
			});
            //reference popup/controller
            $scope.showReference = function(input) {
                var modalInstance = $modal.open({
                    templateUrl: 'Reference-Content.html',
                    controller: ReferenceModalCtrl,
                    resolve: {
                        input:function(){
                            return input;
                        }
                    }
                });
            };
            var ReferenceModalCtrl = function($scope, $modalInstance, input) {
                $scope.input = input;
                $scope.cancel = function() {
                    $modalInstance.dismiss('cancel');
                };
            };
            
            //INPUT ENGINE
            $scope.digestValues = function(restoreDefaults) {
                //initialize state object if not already present
                if(!$scope.parentObject.state){
                    $scope.parentObject.state = {}; 
                }             
                //initialize the list object
                var container = {
                    list:{
                        ofValues:function(){
							var array = Array.prototype.slice.call(arguments, 0);
							if(typeof array[0] === 'object'){
								return array;
							}else{
								return array.map(function(value){
									return {
										key: value,
										value: value
									};
								});
							}
                        },
                        ofSpaces: function(){
                            if(!this._spaces){
                                this._spaces = _.uniq(_.pluck($scope.components, 'space')).map(function(space){
                                    return {
                                        key:space,
                                        value:space
                                    };
                                });
                            }
                            return this._spaces;
                        },
                        ofTags:function(){
                            if(!this._tags){
                                this._tags = _.uniq(_.pluck($scope.components, 'tag')).map(function(tag){
                                    return {
                                        key:tag,
                                        value:tag
                                    };
                                });
                            }
                            return this._tags;
                        },
                        ofComponents:function(filter){
                            
                            if(typeof filter === 'object'){
                                return _.where($scope.components, filter).map(function(component){
                                    return{
                                        key:component.name,
                                        value:component._id
                                    };
                                });
                            }else{
                                return _.filter($scope.components, filter).map(function(component){
                                    return{
                                        key:component.name,
                                        value:component._id
                                    };
                                });
                            }
                        }   
                    },
                    if:function(condition, ifTrue, ifFalse){
                        return condition ? ifTrue : ifFalse;
                    },
                    contains:function(text, textToFind){
                        if(text && textToFind){
                            return text.indexOf(textToFind) != -1;
                        }else{
                            return false;
                        }
                        
                    }                  
                };
                
                for (var i = 0; i < $scope.schema.sections.length; i++) {
                    var hiddenInputs = 0;
                    var section = $scope.schema.sections[i];
                    section.view = {};
                    _.each(section.inputs, function(input) {
                        var timer = new Date();
                        console.log('----------' + input.name + "----------");
                        //create the new scope for the inputs - NEEDS to refresh for each input.
                        var inputScope = {};
                        inputScope = $.extend({}, $scope.project.values, $scope.component.values, container);
                        console.log(inputScope);
                        //initialize input state if necessary
                        if (!$scope.parentObject.state[input.alias]) {
                            $scope.parentObject.state[input.alias] = {};
                        }
                        var inputState = $scope.parentObject.state[input.alias];
                        console.log(inputState);
                        //view controls  - check if hidden then go to next in loop        
                        if (input.hidden) {
                            if ($parse(input.hidden)(inputScope)) {
                                inputState.isHidden = true;
                                hiddenInputs += 1;
                                return;
                            } else {
                                inputState.isHidden = false;
                            }
                        } else {
                            inputState.isHidden = false;
                        }
                        //if restoring defaults, set userValue to false, will recalculate default values
                        if (restoreDefaults) {
                            inputState.userValue = false;
                        }
                        var placeholder = {};
                        //need values for a dropdown
                        if (input.lookupTableId && input.lookupTableId !== "None") { //input has a lookup table, lets calculate the values    
                            var inputOptions = [];
                            //console.log($scope.project.libraries[libraryIndex].activeComponent);
                            if (input.lookupTableId === 'Custom') { //based on lookuptable
                                for (var y = 0; y < input.lookupTable.optionCells.length; y++) {
                                    for (var x = 0; x < input.lookupTable.optionCells[y].length; x++) {
                                        var Xpression = input.lookupTable.xConditions[x];
                                        //console.log(Xpression);
                                        if ($parse(Xpression)(inputScope)) {
                                            //console.log("Evaluated as true: " + Xpression);
                                            var Ypression = input.lookupTable.yConditions[y];
                                            if ($parse(Ypression)(inputScope)) {
                                                //console.log("Evaluated as true: " + Ypression);
                                                inputOptions.push(input.lookupTable.optionCells[y][x]);
                                            }
                                        }
                                    }
                                }
                            }
                            //initialize input state options
                            inputState.options = [];
                            if (inputOptions.length === 1 && !inputState.userValue) {
                                //if just one, set this to the input value   
                                placeholder.inputValue = $parse(inputOptions[0])(inputScope);
                            }
                            if (inputOptions.length >= 1) {
                                for (var i = 0; i < inputOptions.length; i++) {
                                    inputState.options.push($parse(inputOptions[i])(inputScope));
                                }
                                //when more than one, set the first matching option to the input value
                                placeholder.inputValue = inputState.options[0];
                            }
                        } //end lookup table options    
                        //check default value
                        if (input.defaultValue) {
                            //if the default value hasn't been overrided and this is not supposed to be a dropdown list, calculate new value
                            var expression = angular.copy(input.defaultValue);
                            placeholder.inputValue = $parse(expression)(inputScope);
                            placeholder.override = !inputState.userValue;
                        }
                        //set up dropdown options from options
                        if(input.options){//list functionality, pulling from components
                            var inputOptions = $parse(input.options)(inputScope);
                            var optionValues = _.pluck(inputOptions, "value");                     
                            inputState.options = [];
                            //set first value as default   
                            console.log(placeholder.inputValue);
                            console.log(optionValues);   
                            if(input.restricted){                                
                                if(placeholder.inputValue && optionValues.indexOf(placeholder.inputValue) === -1){
                                    console.log("overwrite");
                                    placeholder.inputValue = inputOptions[0].value;
                                    placeholder.override = true;
                                }else if($scope.parentObject.values[input.alias] && optionValues.indexOf($scope.parentObject.values[input.alias]) === -1){
                                    console.log("overwrite");
                                    placeholder.inputValue = inputOptions[0].value;
                                    placeholder.override = true;
                                }/*else if(!inputState.userValue){
                                    placeholder.inputValue = inputOptions[0].value;
                                    placeholder.override = true;
                                }   */                             
                            }
                            if (inputOptions.length >= 1) {
                                inputState.options = inputOptions;
                            }
                        }
                        if (placeholder.inputValue !== undefined && placeholder.override) { //if a new value should be assigned                                                 
                            //if not not a number (ie a number), then set it as such
                            if (!isNaN(placeholder.inputValue)) {
                                placeholder.inputValue = Number(placeholder.inputValue);
                            } else if (Object.prototype.toString.call(placeholder.inputValue) === '[object Date]') { //catch date objects and convert to ISO string format
                                placeholder.inputValue = placeholder.inputValue.toISOString();
                            }
                            $scope.parentObject.values[input.alias] = placeholder.inputValue; //if component, add it to component values
                        }
                        if(input.keyboard === 'number'){
                            //expression
                            if(isNaN($scope.parentObject.values[input.alias]) || $scope.parentObject.values[input.alias] === '') {
                                $scope.parentObject.values[input.alias] = $parse($scope.parentObject.values[input.alias])(inputScope); 
                            }else{//already numeric, just convert
                                $scope.parentObject.values[input.alias] = +$scope.parentObject.values[input.alias];
                            }
                        }                         
                        var endTime = new Date();
                        var elapsed = endTime.getTime() - timer.getTime();
                        console.log("Timer: " + elapsed);
                    });
                    if (section.inputs.length === hiddenInputs) {
                        section.view.isHidden = true;
                    }
                } //for loop
                console.log("-------------");
            }; //function
            //if preview, run digest values right away
            if ($scope.isPreview) {
                $scope.parentObject = $scope.schema.libraryType === 'Descriptive' ? $scope.project : $scope.component;
                $scope.digestValues();
            }
        }
    };
})
//workaround for carousel
.directive('disableNgAnimate', ['$animate',
    function($animate) {
        return {
            restrict: 'A',
            link: function(scope, element) {
                $animate.enabled(false, element);
            }
        };
    }
]);
