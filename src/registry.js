// Export the UserRegistry object to the servlet can use it.
module.exports = {
	UserRegistry: UserRegistry
}


//Definition of helper class to represent registrar of users
function UserRegistry() {
    this.usersByExt = {};
    this.register = registerUser;
    this.unregister = unregisterUser;
    this.getByExt = getUserByExt;
}

function registerUser(user) {
    this.usersByExt[user.ext] = user;
}

function unregisterUser(ext) {
    var user = this.getByExt(ext);
    if (user) {
        delete this.usersByExt[ext];
    }
}

function getUserByExt(ext) {
    return this.usersByExt[ext];
}
