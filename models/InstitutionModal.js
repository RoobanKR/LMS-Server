const mongoose = require("mongoose");


const institutionSchema = new mongoose.Schema({
    inst_id: {
        type: String,
        required: [true, "createdBy is required"] 
    },
    inst_name: {
        type: String,
        required: [true, "createdBy is required"] 
    },

    inst_owner: {
        type: String,
        required: [true, "createdBy is required"] 

    },
    
    phone: {
        type: String,
        required: [true, "createdBy is required"] 

    },
    address: {
        type: String,
        required: [true, "createdBy is required"] 
    },
   
    createdAt: {
        type: Date,
        default: new Date(),
    },
    createdBy: { 
        type: String, 
        default: 'self', 
        required: [true, "createdBy is required"] 
    },
});


module.exports = mongoose.model("LMS-Institution", institutionSchema);
