(function(App) {
	'use strict';

    function VPNClient() {
    	if (!(this instanceof VPNClient)) {
    		return new VPNClient();
    	}
    	this.running = false;
    	this.ip = false;
    }

    VPNClient.prototype.launch = function() {
    	var vpnClient = gui.Window.open('http://localhost:8080/', {
        	position: 'center',
        	frame: false,
        	focus: true,
        	toolbar: false,
        	resizable: false,
          	width: 500,
          	height: 500
        });
        window.setVPNClient = function(Client){
        	window.App.VPN = Client;
        }
        vpnClient.on('loaded', function(){
            vpnClient.window.imReady(window);
        });
    };

	// initialize VPN instance globally
	App.VPNClient = new VPNClient();

})(window.App);
