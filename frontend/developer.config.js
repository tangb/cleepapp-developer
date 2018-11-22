/**
 * Developer configuration directive
 * Helps developer to analyze and publish module to cleep store
 */
var developerConfigDirective = function($rootScope, toast, raspiotService, developerService, systemService, $timeout, appToolbarService, $sce)
{

    // konami code: ssuperr

    var developerController = ['$scope', function($scope) {
        var self = this;
        self.config = {
            moduleInDev: null
        };
        self.selectedModule = null;
        self.modules = [];
        self.data = null;
        self.selectedNav = 'buildmodule';
        self.selectedMainNav = 'devtools';
        self.loading = false;
        self.analyzeError = null;
        self.logs = '';
        self.codemirrorInstance = null;
        self.codemirrorOptions = {
            lineNumbers: true,
            tabSize: 2,
            readOnly: true,
            onLoad: function(cmInstance) {
                self.codemirrorInstance = cmInstance;
                cmInstance.focus();
            }
        };
        self.remotedevUuid = null;
        self.raspiotService = raspiotService;

        /**
         * Init controller
         */
        self.init = function()
        {
			//set remotedev device
			self.setRemotedevDevice();

            //load module configuration
            raspiotService.getModuleConfig('developer')
                .then(function(config) {
                    self.setConfig(config);

                    //get list of module names
                    self.modules = self.__modulesList(false);

                    //make sure god mode wasn't enabled before
                    if( self.config.moduleInDev && self.modules.indexOf(self.config.moduleInDev)===-1 )
                    {
                        self.modules = self.__modulesList(true);
                    }
                });
        };

        /**
         * Load modules that can be developed
         */
        self.__modulesList = function(all)
        {
            if( all===undefined ) {
                all = false;
            }

            var temp = [];
            for( var module in raspiotService.modules )
            {
                if( raspiotService.modules[module].locked || !all )
                {
                    //system module, drop it
                    continue;
                }

                if( module=='developer' && !all )
                {
                    //drop developer module
                    continue;
                }

                //append module name
                temp.push(module);
            }
            return temp.sort();
        };

        /**
         * Dummy click for line hover
         */
        self.dummyClick = function()
        {};

        /**
         * Godmode
         */
        self.godMode = function()
        {
            toast.info('God mode activated, all modules are available in list');
            self.modules = self.__modulesList(true);
        };

		/**
         * Set remotedev device
         */
        self.setRemotedevDevice = function()
        {
           	for( var i=0; i<raspiotService.devices.length; i++ )
	        {
    	        if( raspiotService.devices[i].type==='developer' )
        	    {
                    self.remotedevUuid = raspiotService.devices[i].uuid;
                    break;
	            }
    	    }
        };

        /**
         * Set module configuration internally
         */
        self.setConfig = function(config) 
        {
            if( config )
            {
                self.config.moduleInDev = config.moduleindev;
                self.selectedModule = config.moduleindev || '';
            }
        };

        /**
         * Reload backend
         */
        self.restartBackend = function()
        {
            developerService.restartCleepOs();
        };

        /**
         * Restart frontend
         */
        self.restartFrontend = function()
        {
            window.location.reload();
        }

        /**
         * Select module turns on debug on it and enable module analyze in build helper tab
         */
        self.selectModule = function()
        {
            //set module in development
            developerService.setModuleInDev(self.selectedModule)
                .then(function() {
                    //reload configuration
                    return raspiotService.reloadModuleConfig('developer');
                })
                .then(function(config) {
                    //save new config
                    self.setConfig(config);

                    //clear previous analysis
                    self.resetAnalysis();

                    //user message
                    if( config.moduleindev )
                    {
                        toast.success('Module "' + self.selectedModule + '" in development');
                    }
                    else
                    {
                        toast.success('No module in development');
                    }
                });
        };


        /**
         * Reset analysis
         */
        self.resetAnalysis = function()
        {
            self.data = null;
            self.analyzeError = null;
        };

        /**
         * Analyze selected module
         */
        self.analyzeModule = function()
        {
            //reset members
            self.resetAnalysis();

            //set loading
            self.loading = true;

            //check params
            if( !self.config.moduleInDev )
            {
                toast.error('Please select a module');
                self.loading = false;
                return;
            }

            //analyze module
            developerService.analyzeModule(self.config.moduleInDev)
                .then(function(resp) {
                    //save module content
                    self.data = resp.data;
                    var items = []
                    for( var i=0; i<self.data.js.errors.length; i++ )
                        items.push($sce.trustAsHtml(self.data.js.errors[i]));
                    self.data.js.errors = items;
                    items = []
                    for( var i=0; i<self.data.js.warnings.length; i++ )
                        items.push($sce.trustAsHtml(self.data.js.warnings[i]));
                    self.data.js.warnings = items;
                    items = []
                    for( var i=0; i<self.data.python.errors.length; i++ )
                        items.push($sce.trustAsHtml(self.data.python.errors[i]));
                    self.data.python.errors = items;
                    items = []
                    for( var i=0; i<self.data.python.warnings.length; i++ )
                        items.push($sce.trustAsHtml(self.data.python.warnings[i]));
                    self.data.python.warnings = items;
            
                    //select first nav tab
                    self.selectedNav = 'buildmodule';
                }, function(err) {
                    self.analyzeError = err;
                })
                .finally(function() {
                    self.loading = false;
                });
        };

        /**
         * Generate desc.json file
         */
        self.generateDescJson = function()
        {
            if( !self.data ) {
                return;
            }

            developerService.generateDescJson(self.data.js.files, self.data.icon)
                .then(function(resp) {
                    if( resp.data )
                        toast.success('Desc.json file generated in module directory');
                    else
                        toast.error('Problem generating desc.json file. Please check logs');
                });
        };

        /**
         * Build package
         */
        self.buildPackage = function()
        {
            //check data
            if( !self.data )
                return;
    
            self.loading = true;
            developerService.buildPackage(self.config.moduleInDev, self.data, 30)
                .then(function(resp) {
                    //build generation completed, download package now
                    return developerService.downloadPackage();
                })
                .then(function(resp) {
                }, function(err) {
                    console.error('Download failed:', err);
                    toast.error('Download failed');
                })
                .finally(function() {
                    self.loading = false;
                });
        };

        /**
         * Load logs
         */
        self.loadLogs = function()
        {
            self.loading = true;

            systemService.getLogs()
                .then(function(resp) {
                    self.logs = resp.data.join('');
                    self.codemirrorInstance.refresh();

                    if( self.logs.length===0 )
                    {
                        toast.info('Log file is empty');
                    }

                    //jump to end of log
                    $timeout(function() {
                        self.codemirrorInstance.setCursor(self.codemirrorInstance.lineCount(), 0);
                    }, 300);
                })
                .finally(function() {
                    self.loading = false;
                });
        };

        /**
         * Clear logs
         */
        self.clearLogs = function()
        {
            self.loading = true;

            systemService.clearLogs()
                .then(function() {
                    self.logs = '';
                    self.codemirrorInstance.refresh();

                    toast.info('Log file is cleared');
                })
                .finally(function() {
                    self.loading = false;
                });
        };

        /**
         * Goto top of logs
         */
        self.gotoLogsTop = function()
        {
            self.codemirrorInstance.setCursor(0, 0);
        };

        /**
         * Goto bottom of logs
         */
        self.gotoLogsBottom = function()
        {
            self.codemirrorInstance.setCursor(self.codemirrorInstance.lineCount(), 0);
        };

        /**
         * Start remotedev
         */
        self.startRemotedev = function() {
            developerService.startRemotedev()
                .then(function(resp) {
                    if( resp.data ) {
                        self.device.running = true;
                    }
                }); 
        };  

        /**
         * Stop remotedev
         */
        self.stopRemotedev = function() {
            developerService.stopRemotedev()
                .then(function(resp) {
                    if( resp.data ) {
                        self.device.running = false;
                    }
                }); 
        };

    }];

    var developerLink = function(scope, element, attrs, controller) {
        controller.init();
    };

    return {
        templateUrl: 'developer.config.html',
        replace: true,
        controller: developerController,
        controllerAs: 'devCtl',
        link: developerLink
    };
};

var RaspIot = angular.module('RaspIot');
RaspIot.directive('developerConfigDirective', ['$rootScope', 'toastService', 'raspiotService', 'developerService', 'systemService', '$timeout',
                    'appToolbarService', '$sce', developerConfigDirective]);
