const express = require('express');
const router = express.Router();

// Import individual route modules
const resetpasswordRoute = require('./resetpassword');
const loginRoute = require('./login');
const coachRoute = require('./coach');
const userRoute = require('./user');
const registerRoute = require('./register');
const transactionRoute = require('./transactions');
const driverTrackerRoute = require('./drivertracker');
const coachesRoute = require('./coaches');

// Mount coaches route
router.use('/coaches', coachesRoute);
//Authencations
router.use('/resetpassword', resetpasswordRoute);
router.use('/register', registerRoute); 
router.use('/login', loginRoute);   
       
//Profile routes
router.use('/user', userRoute);
//Coach routes
router.use('/coach', coachRoute);
router.use('/drivertracker', driverTrackerRoute);
//Transactions routes
router.use('/transactions', transactionRoute);

module.exports = router;
