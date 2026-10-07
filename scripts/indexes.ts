import "./environment";
import mongoose from "mongoose";
import { connect } from "../database/connection";
import { models } from "../database/models";
await connect();
for (const model of models) {
  await model.createIndexes();
  console.log(`Created/verified ${model.modelName} indexes`);
}
await mongoose.disconnect();
