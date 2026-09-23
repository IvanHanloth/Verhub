-- WebDAV 分片存储：后端级分片大小与文件写入时实际使用的分片大小。
ALTER TABLE "StorageBackend" ADD COLUMN "partSize" INTEGER;
ALTER TABLE "StoredFile" ADD COLUMN "partSize" INTEGER;
