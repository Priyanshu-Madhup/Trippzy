"""Cloudflare R2 (S3 API). Objects are private; clients get short-lived presigned URLs.

Key layout: u/{user_id}/{trip_id}/{document_id}/original.<ext>
            u/{user_id}/{trip_id}/{document_id}/pages/{n}.webp
boto3 is synchronous; calls that touch the network run in a worker thread.
"""

import asyncio
from functools import cached_property

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.core.config import Settings

EXT = {"application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}


def doc_prefix(user_id: str, trip_id: str, document_id: str) -> str:
    return f"u/{user_id}/{trip_id}/{document_id}/"


def original_key(user_id: str, trip_id: str, document_id: str, mime: str) -> str:
    return f"{doc_prefix(user_id, trip_id, document_id)}original.{EXT[mime]}"


def page_key(user_id: str, trip_id: str, document_id: str, n: int) -> str:
    return f"{doc_prefix(user_id, trip_id, document_id)}pages/{n}.webp"


class Storage:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.bucket = settings.r2_bucket

    @cached_property
    def _s3(self):
        if not self.settings.r2_endpoint:
            from app.core.errors import AppError

            raise AppError(503, "storage_not_configured", "File storage is not configured on the server.")
        return boto3.client(
            "s3",
            endpoint_url=self.settings.r2_endpoint,
            aws_access_key_id=self.settings.r2_access_key_id,
            aws_secret_access_key=self.settings.r2_secret_access_key,
            region_name="auto",
            config=Config(signature_version="s3v4", retries={"max_attempts": 3}, s3={"addressing_style": "path"}),
        )

    def presign_put(self, key: str, content_type: str, expires: int) -> str:
        return self._s3.generate_presigned_url("put_object", Params={"Bucket": self.bucket, "Key": key, "ContentType": content_type}, ExpiresIn=expires)

    def presign_get(self, key: str, expires: int, download_name: str | None = None) -> str:
        params = {"Bucket": self.bucket, "Key": key}
        if download_name:
            safe = download_name.replace('"', "").replace("\r", "").replace("\n", "")[:150]
            params["ResponseContentDisposition"] = f'attachment; filename="{safe}"'
        return self._s3.generate_presigned_url("get_object", Params=params, ExpiresIn=expires)

    async def head(self, key: str) -> dict | None:
        def run():
            try:
                return self._s3.head_object(Bucket=self.bucket, Key=key)
            except ClientError as e:
                if e.response["Error"]["Code"] in ("404", "NoSuchKey", "NotFound"):
                    return None
                raise

        return await asyncio.to_thread(run)

    async def get_range(self, key: str, start: int, end: int) -> bytes:
        def run():
            r = self._s3.get_object(Bucket=self.bucket, Key=key, Range=f"bytes={start}-{end}")
            return r["Body"].read()

        return await asyncio.to_thread(run)

    async def get_bytes(self, key: str) -> bytes:
        return await asyncio.to_thread(lambda: self._s3.get_object(Bucket=self.bucket, Key=key)["Body"].read())

    async def put_bytes(self, key: str, data: bytes, content_type: str) -> None:
        await asyncio.to_thread(lambda: self._s3.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type))

    async def delete_prefix(self, prefix: str) -> int:
        """Delete every object under a prefix (user/trip/document cleanup, account deletion)."""

        def run() -> int:
            count = 0
            paginator = self._s3.get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
                keys = [{"Key": o["Key"]} for o in page.get("Contents", [])]
                if keys:
                    self._s3.delete_objects(Bucket=self.bucket, Delete={"Objects": keys, "Quiet": True})
                    count += len(keys)
            return count

        return await asyncio.to_thread(run)

    async def delete_key(self, key: str) -> None:
        await asyncio.to_thread(lambda: self._s3.delete_object(Bucket=self.bucket, Key=key))
