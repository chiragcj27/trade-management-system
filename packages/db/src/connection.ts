import mongoose from "mongoose";

// Every database call inside runInTransaction automatically joins its session.
mongoose.set("transactionAsyncLocalStorage", true);

export async function connectDb(uri: string, dbName?: string): Promise<void> {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, ...(dbName ? { dbName } : {}) });
  await mongoose.connection.createCollections();
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}

export function isDbConnected(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}

/** Applies a group of writes all together or not at all. Money and custody changes must use this. */
export async function runInTransaction<T>(work: () => Promise<T>): Promise<T> {
  let result: T | undefined;
  await mongoose.connection.transaction(async () => {
    result = await work();
  });
  return result as T;
}

export async function nextCounter(name: string): Promise<number> {
  const collection = mongoose.connection.collection<{ _id: string; value: number }>("counters");
  const updated = await collection.findOneAndUpdate(
    { _id: name },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: "after" },
  );
  return updated?.value ?? 1;
}
