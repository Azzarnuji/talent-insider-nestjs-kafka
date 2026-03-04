#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";

const targetFolderArg = process.argv[2];
const idType = process.argv[3];

if (!targetFolderArg || !idType) {
  console.error(
    "Usage: npx nestjs-kafka-publish-migration <TargetFolder> <uuid|increment>",
  );
  process.exit(1);
}

if (idType !== "uuid" && idType !== "increment") {
  console.error('Invalid ID type. Must be "uuid" or "increment".');
  process.exit(1);
}

const targetFolder = path.resolve(process.cwd(), targetFolderArg);

// Path migrations di dalam package
// Saat diinstall, file ini ada di dist/bin/publish-migration.js
// Migrations ada di dist/migrations (sebagai .js) atau src/migrations (sebagai .ts)
// Kita coba cari yang .ts dulu kalau ada (buat development/local link)
// Kalau gak ada, kita cari yang .js di dist.

let migrationsDir = path.join(__dirname, "../migrations"); // dist/migrations

// Jika kita ingin copy file .ts (template)
// Kita asumsikan folder src ada (karena user pake link local atau kita include src di package)
const srcMigrationsDir = path.join(__dirname, "../../src/migrations");

if (fs.existsSync(srcMigrationsDir)) {
  migrationsDir = srcMigrationsDir;
}

if (!fs.existsSync(migrationsDir)) {
  console.error(`Migrations directory not found at: ${migrationsDir}`);
  process.exit(1);
}

if (!fs.existsSync(targetFolder)) {
  fs.mkdirSync(targetFolder, { recursive: true });
}

const files = fs.readdirSync(migrationsDir).filter((file) => {
  if (idType === "uuid") return file.includes("CreateOutboxTable");
  if (idType === "increment") return file.includes("CreateOutboxIntTable");
  return false;
});

if (files.length === 0) {
  console.error(`No migration file found for type: ${idType}`);
  process.exit(1);
}
const timestamp = Date.now();

files.forEach((file, index) => {
  const srcFile = path.join(migrationsDir, file);

  // Ambil nama file tanpa timestamp lama (format: 1234567890-Nama.ts)
  const parts = file.split("-");
  const originalTimestamp = parts[0];
  const nameWithExt = parts.slice(1).join("-");

  // Timestamp baru (tambah index biar unik kalau ada multiple files)
  const newTimestamp = timestamp + index;
  const newFileName = `${newTimestamp}-${nameWithExt}`;
  const destFile = path.join(targetFolder, newFileName);

  if (fs.lstatSync(srcFile).isFile()) {
    let content = fs.readFileSync(srcFile, "utf8");

    // Ganti timestamp di dalam class name (TypeORM pattern)
    // misal: CreateOutboxTable1709456789000 -> CreateOutboxTable1709457...
    content = content.replace(
      new RegExp(originalTimestamp, "g"),
      newTimestamp.toString(),
    );

    fs.writeFileSync(destFile, content);
    console.log(
      `Published: ${newFileName} -> ${targetFolderArg}/${newFileName}`,
    );
  }
});

console.log("\nMigrations published successfully!");
console.log(`Now you can add them to your TypeOrmModule configuration.`);
