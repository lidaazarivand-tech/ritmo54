package com.adelapp.larkplayer;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;

/** Bounded, strict file decoding and byte-for-byte save verification. No Android APIs. */
final class BackupFileIO {
    static String readUtf8(InputStream stream, int limit) throws IOException {
        if (stream == null) throw new IOException("Backup file is not readable");
        try (ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = stream.read(buffer)) != -1) {
                if (count > limit - bytes.size()) throw new IOException("Backup file exceeds size limit");
                bytes.write(buffer, 0, count);
            }
            return StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes.toByteArray())).toString();
        }
    }

    static void verify(InputStream stream, byte[] payload) throws IOException {
        if (stream == null) throw new IOException("Saved backup cannot be verified");
        byte[] buffer = new byte[8192];
        int count, offset = 0;
        while ((count = stream.read(buffer)) != -1) {
            if (count > payload.length - offset) throw new IOException("Saved backup is larger than expected");
            for (int i = 0; i < count; i++)
                if (buffer[i] != payload[offset + i]) throw new IOException("Saved backup differs from source");
            offset += count;
        }
        if (offset != payload.length) throw new IOException("Saved backup is incomplete");
    }
}
