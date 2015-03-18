(function () {
    var app = angular.module('lithoApp', []);

    app.controller('LithoAppController', ['$scope', '$http', function($scope, $http) {
    
        function SliderValue(value,setting) {
            var _currentValue = value;
            var currentSetting = setting;

            Object.defineProperty(this,"currentValue",{  // this answers the comment (pun intended)
                get: function() { 
                    return _currentValue; 
                },
                set: function(value) { 
                    value = parseFloat(value);
                    _currentValue = value; 
                    currentSetting.value=_currentValue;
                    $scope.lithophane.params[currentSetting.name]=_currentValue;
                    $scope.lithophane.updateValues($scope.lithophane);
                }
            });

        };

        $scope.lithophane = new LITHO.Lithophane();
        
        $scope.loadProgress=0;
        $scope.loadStatus='';
        $scope.modelProgress=0;
        $scope.modelStatus='';
        
        $scope.files=[];
            
        $scope.$on('LoadProgress', function() {
            $scope.loadProgress=$scope.lithophane.loadProgress;
            $scope.loadStatus=$scope.lithophane.loadStatus;
            $scope.$apply();
        });
        
        $scope.$on('ModelProgress', function() {
            $scope.modelProgress=$scope.lithophane.modelProgress;
            $scope.modelStatus=$scope.lithophane.modelStatus;
            $scope.$apply();
        });
        
        $scope.$on('FilesUpdate', function() {
            $scope.fileDrop($scope.lithophane.files);
        });
        $scope.fileDrop = function(files) {
            $scope.files=files;
            $scope.lithophane.fileEventHandler($scope.lithophane,files);
        };
    
        this.fileIsSelected = function(file) {
            if ((file.image!=undefined)&&($scope.lithophane.params.image!==undefined)) {
                return ($scope.lithophane.params.image==file.image);
            }
            return false;
        }
        this.fileClicked = function(tab,file) {
            if (file.image!=undefined) {
                file.image.onclick(file.image);
                tab.setTab(2);
            }
        }
        
        $http.get('data/'+localeFile).success(function(data) {
            $scope.layout = data;
            $scope.settings=$scope.layout.tabs[2].pages;
            for (var i=0,il=$scope.settings.length;i<il;i++) {
                for (var j=0,jl=$scope.settings[i].values.length;j<jl;j++) {
                    var setting=$scope.settings[i].values[j];
                    if (setting.type==='range') {
                        $scope.lithophane.params[setting.name]=setting.value;
                    }
                }
            }
            $scope.lithophane.params['form']='flat';
            $scope.lithophane.StatusMessages=$scope.layout.textMessages;
            $scope.lithophane.updateValues($scope.lithophane);
            //var storedSttings=localStorage.getItem( 'LithoSettings' );
            //if ((storedSttings!==null)&&(storedSttings!==undefined)) {
            //    $scope.settings=JSON.parse(storedSttings);
            //}
            
        }); 
        $scope.getWindowHeight = function() {
            if ($scope.windowHeight!==undefined)  {
                $scope.lithophane.Resize($scope.lithophane);
                var newWinSize=$scope.windowHeight-565;
                if ($scope.windowWidth<512) {
                    newWinSize=$scope.windowHeight-605;
                }
                if (newWinSize<300) newWinSize=300;
                return newWinSize;
            }
            return 300;
        }
        this.triggerDownload = function() {
            $scope.lithophane.downloadSTL($scope.lithophane);
        }
        this.triggerRefresh = function() {
            $scope.lithophane.createHeightMesh($scope.lithophane);
        }
        this.initLithophane = function() {
            return $scope.lithophane.initPage($scope.lithophane);
        };
        this.getSettings = function() {
            return $scope.settings;
        }
        this.getLogo = function() {
            if (($scope.layout!==undefined)&&($scope.layout.appLogo!==undefined)) {
                return $scope.layout.appLogo;
            } 
            return 'images/logo.png';
        }
        this.getTitle = function() {
            if (($scope.layout!==undefined)&&($scope.layout.appTitle!==undefined)) {
                return $scope.layout.appTitle;
            }
            return 'Image to Lithophane';
        }
        this.statusMessage = function(name) {
            if (($scope.layout!==undefined)&&($scope.layout.textMessages!==undefined)) {
                return $scope.layout.textMessages[name];
            }
            return '';
        }
        this.textMessage = function(name) { 
            if (($scope.layout!==undefined)&&($scope.layout.textMessages!==undefined)) {
                return $scope.layout.textMessages[name];
            }
            return '';
        }
        this.formImage = function(index) {
            if (($scope.layout!==undefined)&&($scope.layout.modelForms!==undefined)&&(index>=0)&&(index<=$scope.layout.modelForms.length)) {
                return($scope.layout.modelForms[index].imageURL);
            }
            return '';
        }
        this.formTitle = function(index) {
            if (($scope.layout!==undefined)&&($scope.layout.modelForms!==undefined)&&(index>=0)&&(index<=$scope.layout.modelForms.length)) {
                return($scope.layout.modelForms[index].title);
            }
            return '';
        }
        this.selectform = function(index) {
            if (($scope.layout!==undefined)&&($scope.layout.modelForms!==undefined)&&(index>=0)&&(index<=$scope.layout.modelForms.length)) {
                for (var i=0,il=$scope.layout.modelForms.length;i<il;i++) {
                    if (i===index) {
                        $scope.layout.modelForms[i].selected="true";
                    } else {
                        $scope.layout.modelForms[i].selected="false";
                    }
                }
                $scope.lithophane.params['form']=$scope.layout.modelForms[index].name;
                $scope.lithophane.updateValues($scope.lithophane);
            }
        }
        this.isSelected = function(index) {
            if (($scope.layout!==undefined)&&($scope.layout.modelForms!==undefined)&&(index>=0)&&(index<=$scope.layout.modelForms.length)) {
                return($scope.layout.modelForms[index].selected==="true");
            }
            return false;
        }
        
        this.setupSlider = function(setting) {
            if (setting.type==='range') {
                if (setting.slider===undefined) { 
                    setting.slider=new SliderValue(setting.value,setting);
                    //setting.sliderman=new Slider('#'+setting.name);
//                    setting.sliderman.on("slide", function(slideEvent) { 
//                        setting.slider.currentValue=slideEvent.value;//.newValue;
//                    });
                }
                return true;
            }
            return false;
        };
        /*        this.setupSlider = function(setting) {
            if (setting.type==='range') {
                if (setting.slider===undefined) {
                    setting.slider=new Slider('#'+setting.name);
                    setting.slider.on("change", function(slideEvent) { // 'slide'
                        var position=slideEvent.value.newValue;
                        if (setting.value!==position) {
                            $('#'+setting.name+"SliderVal").text(position);
                            setting.value=position;
//                        var storedSttings=JSON.stringify($scope.settings);
//                        localStorage.setItem('LithoSettings',storedSttings);
                            $scope.lithophane.params[setting.name]=position;
                            $scope.lithophane.updateValues($scope.lithophane);
                        }
                    });
                }
                return true;
            }
            return false;
        };
*/
    }]);
    app.directive('disableAnimation', function($animate){
        return {
            restrict: 'A',
            link: function($scope, $element, $attrs){
                $attrs.$observe('disableAnimation', function(value){
                    $animate.enabled(!value, $element);
                });
            }
        }
    });
    app.directive('resize', function ($window) {
        return function (scope, element) {
            var w = angular.element($window); 
            scope.$watch(function () {
                return { 'h': w[0].innerHeight, 'w': w[0].innerWidth };
            }, function (newValue, oldValue) {
                scope.windowHeight = newValue.h;
                scope.windowWidth = newValue.w;
            }, true);
            w.bind('resize', function () {
                scope.$apply();
            });
        };
    });    
    app.controller('TabController', ['$scope', function($scope) {
        tab = 2;
        
        $scope.$on('tabChange', function() {
            tab=2;
            $scope.$apply();
        });
        
        this.setTab = function (currentIndex) {
            tab = currentIndex;
        };
        this.isCurrent = function (index) {
            return tab === index;
        };
        this.tabName = function (index) {
            if (($scope.layout!==undefined)&&($scope.layout.tabs!==undefined)&&(index>=0)&&(index<=$scope.layout.tabs.length)) {
                return $scope.layout.tabs[index-1].name;
            }
            return index;
        };
        this.tabTitle = function (index) {
            if (($scope.layout!==undefined)&&($scope.layout.tabs!==undefined)&&(index>=0)&&(index<=$scope.layout.tabs.length)) {
                return $scope.layout.tabs[index-1].title;
            }
            return index;
        };
        this.tabHint = function (index) {
            if (($scope.layout!==undefined)&&($scope.layout.tabs!==undefined)&&(index>=0)&&(index<=$scope.layout.tabs.length)) {
                return $scope.layout.tabs[index-1].hint;
            }
            return index;
        };
    }]);
})();


