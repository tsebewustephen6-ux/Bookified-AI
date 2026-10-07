import "./environment";
import mongoose from "mongoose";
import { connect } from "../database/connection";
import { processJob } from "../lib/processing";
await connect();
await processJob(process.argv[2], process.argv[3]);
await mongoose.disconnect();
