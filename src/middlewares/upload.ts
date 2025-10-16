import multer from "multer";
import path from "path";
import fs from "fs";

/**
 * Tentukan folder upload
 */
const uploadDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * Konfigurasi penyimpanan file
 */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `proof-${uniqueSuffix}${ext}`);
  },
});

/**
 * Filter file hanya gambar dan pdf
 */
const fileFilter = (_req: any, file: multer.File, cb: any) => {
  const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];
  if (!allowedTypes.includes(file.mimetype)) {
    return cb(new Error("Only JPG, PNG, and PDF files are allowed"));
  }
  cb(null, true);
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // Maks 5MB
});
