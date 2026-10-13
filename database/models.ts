import mongoose, { Schema } from "mongoose";
const options = { timestamps: true as const, strict: "throw" as const };
const bookSchema = new Schema(
  {
    ownerId: { type: String, required: true },
    title: { type: String, required: true },
    author: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    personaId: { type: String, required: true },
    fileKey: { type: String, required: true },
    coverKey: String,
    fileSizeBytes: { type: Number, required: true },
    fileHash: String,
    pageCount: { type: Number, default: 0 },
    segmentCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["uploading", "processing", "ready", "failed"],
      default: "uploading",
      required: true,
    },
    processingError: String,
    processingVersion: { type: Number, default: 0 },
    slotHeld: { type: Boolean, default: true },
    admissionKey: { type: String, required: true },
    uploadExpiresAt: { type: Date, required: true },
    pdfComplete: { type: Boolean, default: false },
    coverComplete: { type: Boolean, default: false },
    expectedCoverType: String,
    expectedCoverSize: Number,
    cleanupKeys: { type: [String], default: [] },
  },
  options,
);
bookSchema.index({ ownerId: 1, createdAt: -1 });
bookSchema.index({ ownerId: 1, status: 1 });
bookSchema.index({ ownerId: 1, admissionKey: 1 }, { unique: true });
bookSchema.index(
  { ownerId: 1, fileHash: 1 },
  { unique: true, partialFilterExpression: { fileHash: { $type: "string" } } },
);
const segmentSchema = new Schema(
  {
    ownerId: { type: String, required: true },
    bookId: { type: Schema.Types.ObjectId, required: true },
    processingVersion: { type: Number, required: true },
    segmentIndex: { type: Number, required: true },
    pageStart: { type: Number, required: true },
    pageEnd: { type: Number, required: true },
    content: { type: String, required: true },
    wordCount: { type: Number, required: true },
  },
  options,
);
segmentSchema.index(
  { bookId: 1, processingVersion: 1, segmentIndex: 1 },
  { unique: true },
);
segmentSchema.index({ bookId: 1, pageStart: 1 });
segmentSchema.index({
  ownerId: 1,
  bookId: 1,
  processingVersion: 1,
  content: "text",
});
const sessionSchema = new Schema(
  {
    ownerId: { type: String, required: true },
    bookId: { type: Schema.Types.ObjectId, required: true },
    providerCallId: String,
    providerJoinUrl: String,
    status: {
      type: String,
      enum: ["reserved", "active", "ended", "failed", "expired"],
      default: "reserved",
      required: true,
    },
    reservedAt: { type: Date, required: true },
    startedAt: Date,
    endedAt: Date,
    durationSeconds: { type: Number, default: 0 },
    maxDurationSeconds: { type: Number, required: true },
    planAtStart: { type: String, required: true },
    usagePeriodStart: { type: Date, required: true },
    usagePeriodEnd: { type: Date, required: true },
    idempotencyKey: { type: String, required: true },
    endReason: String,
    counted: { type: Boolean, default: false },
    capabilityHash: String,
    expiresAt: Date,
    resumeFrom: { type: Schema.Types.ObjectId },
    name: { type: String, maxlength: 80 },
    transcript: { type: [new Schema({ role: { type: String, enum: ['user', 'assistant'], required: true }, text: { type: String, required: true } }, { _id: false })], default: [] },
    transcriptRevision: { type: Number, default: 0 },
    transcriptComplete: { type: Boolean, default: false },
    lastRetrievalQuery: String,
    references: [{ segmentId: String, pageStart: Number, pageEnd: Number }],
  },
  options,
);
sessionSchema.index({ ownerId: 1, usagePeriodStart: 1 });
sessionSchema.index({ ownerId: 1, bookId: 1, _id: -1 });
sessionSchema.index({ ownerId: 1, idempotencyKey: 1 }, { unique: true });
sessionSchema.index(
  { providerCallId: 1 },
  {
    unique: true,
    partialFilterExpression: { providerCallId: { $type: "string" } },
  },
);
const accountSchema = new Schema(
  {
    ownerId: { type: String, required: true, unique: true },
    bookSlots: { type: Number, default: 0 },
    activeSessionId: { type: Schema.Types.ObjectId, default: null },
  },
  options,
);
const usageSchema = new Schema(
  {
    ownerId: { type: String, required: true },
    periodStart: { type: Date, required: true },
    connected: { type: Number, default: 0 },
    reserved: { type: Number, default: 0 },
  },
  options,
);
usageSchema.index({ ownerId: 1, periodStart: 1 }, { unique: true });
const jobSchema = new Schema(
  {
    bookId: { type: Schema.Types.ObjectId, required: true, unique: true },
    ownerId: { type: String, required: true },
    status: {
      type: String,
      enum: ["queued", "running", "done", "failed"],
      default: "queued",
    },
    stage: { type: String, default: "Queued" },
    pagesDone: { type: Number, default: 0 },
    totalPages: { type: Number, default: 0 },
    attempts: { type: Number, default: 0 },
    leaseUntil: Date,
    leaseToken: String,
    version: { type: Number, default: 0 },
  },
  options,
);
jobSchema.index({ status: 1, leaseUntil: 1 });
const rateSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    count: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  options,
);
rateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const Book =
  (mongoose.models.Book as mongoose.Model<
    mongoose.InferSchemaType<typeof bookSchema>
  >) || mongoose.model("Book", bookSchema);
export const Segment =
  (mongoose.models.Segment as mongoose.Model<
    mongoose.InferSchemaType<typeof segmentSchema>
  >) || mongoose.model("Segment", segmentSchema);
export const VoiceSession =
  (mongoose.models.VoiceSession as mongoose.Model<
    mongoose.InferSchemaType<typeof sessionSchema>
  >) || mongoose.model("VoiceSession", sessionSchema);
export const Account =
  (mongoose.models.Account as mongoose.Model<
    mongoose.InferSchemaType<typeof accountSchema>
  >) || mongoose.model("Account", accountSchema);
export const Usage =
  (mongoose.models.Usage as mongoose.Model<
    mongoose.InferSchemaType<typeof usageSchema>
  >) || mongoose.model("Usage", usageSchema);
export const Job =
  (mongoose.models.Job as mongoose.Model<
    mongoose.InferSchemaType<typeof jobSchema>
  >) || mongoose.model("Job", jobSchema);
export const Rate =
  (mongoose.models.Rate as mongoose.Model<
    mongoose.InferSchemaType<typeof rateSchema>
  >) || mongoose.model("Rate", rateSchema);
const paymentSchema = new Schema(
  {
    ownerId: { type: String, required: true },
    reference: { type: String, required: true, unique: true },
    idempotencyKey: { type: String, required: true },
    plan: { type: String, enum: ["standard", "pro"], required: true },
    amountMinor: { type: Number, required: true },
    currency: { type: String, enum: ["GHS"], required: true },
    merchantAccount: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },
    open: { type: Boolean, default: true },
    checkoutUrl: String,
    checkoutId: String,
    transactionId: String,
    periodStart: Date,
    periodEnd: Date,
    verifiedAt: Date,
  },
  options,
);
paymentSchema.index({ ownerId: 1, idempotencyKey: 1 }, { unique: true });
paymentSchema.index(
  { ownerId: 1, open: 1 },
  { unique: true, partialFilterExpression: { open: true } },
);
paymentSchema.index({ ownerId: 1, status: 1, periodEnd: 1 });
paymentSchema.index(
  { transactionId: 1 },
  {
    unique: true,
    partialFilterExpression: { transactionId: { $type: "string" } },
  },
);
export const Payment =
  (mongoose.models.Payment as mongoose.Model<
    mongoose.InferSchemaType<typeof paymentSchema>
  >) || mongoose.model("Payment", paymentSchema);
export const models = [
  Book,
  Segment,
  VoiceSession,
  Account,
  Usage,
  Job,
  Rate,
  Payment,
];
