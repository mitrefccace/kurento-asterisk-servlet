var Stack = require("mini-stack");
var credArray = require("./configuration.js").credArray; 

// Export the SipUserPool object so the servlet can use it.
module.exports = {
   SipUserPool: SipUserPool
}

// Manages all the different Sip user/pass pairs usable. 
function SipUserPool() {
    this.clients = Stack();

	initClients(this.clients);
       
	this.getSipUser = getSipUser;
	this.releaseSipUser = releaseSipUser;
}

function initClients(stack) {
	for (i = 0; i < credArray.length; i++) {
		stack.push(credArray[i]);
	}
}

function getSipUser() {
	if (this.clients.size() > 0) {
		return this.clients.pop();
	}
	else {
		return Error("No users left!");
	}
}

function releaseSipUser(user) {
	this.clients.push(user);
}
