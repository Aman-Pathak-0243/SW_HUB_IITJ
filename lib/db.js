import mongoose from "mongoose";

const connection = {
  isConnected: false,
}

async function connectDB() {
  if (connection.isConnected) {
    console.log('Using existing connection')
    return;
  }

  try {
    const db = await mongoose.connect(process.env.MONGODB_URI);

    connection.isConnected = db.connections[0].readyState === 1;
    console.log('Connected to the database successfully');
  } catch (error) {
    console.log('Error while connecting to the database E:', error);
    process.exit(1);
  }
}

export { connectDB };