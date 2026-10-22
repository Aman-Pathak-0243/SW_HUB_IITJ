-- The file bytes for a storageProvider='db' media_asset (lib/media/service.mjs#uploadDbAsset).
-- NULL for every other storage provider.
ALTER TABLE "media_asset" ADD COLUMN "file_data" BYTEA;
