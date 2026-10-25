package com.adelapp.larkplayer;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/** Bounded ID3v2 USLT/ULT reader. Never reads or copies the audio payload. */
final class EmbeddedLyrics {
    private static final int MAX_TAG = 2 * 1024 * 1024;
    private static byte[] read(InputStream stream, int length) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        byte[] buffer = new byte[Math.min(8192, Math.max(1, length))];
        while (bytes.size() < length) {
            if (Thread.currentThread().isInterrupted()) throw new java.io.InterruptedIOException();
            int count = stream.read(buffer, 0, Math.min(buffer.length, length - bytes.size()));
            if (count < 0) break;
            if (count == 0) {
                int single = stream.read(); if (single < 0) break; bytes.write(single);
            } else bytes.write(buffer, 0, count);
        }
        return bytes.toByteArray();
    }
    private static int number(byte[] bytes, int offset, int count, boolean syncsafe) throws IOException {
        long value = 0;
        for (int i = 0; i < count; i++) {
            int part = bytes[offset + i] & 255;
            if (syncsafe && part > 127) throw new IOException("Invalid ID3 size");
            value = (value << (syncsafe ? 7 : 8)) | part;
        }
        if (value > MAX_TAG) throw new IOException("ID3 tag exceeds supported size");
        return (int) value;
    }
    static String read(InputStream stream) throws IOException {
        if (stream == null) throw new IOException("Media is not readable");
        byte[] header = read(stream, 10);
        if (header.length < 10 || header[0] != 'I' || header[1] != 'D' || header[2] != '3') return "";
        int version = header[3] & 255;
        if (version < 2 || version > 4 || (header[5] & 0x40) != 0 && version == 2) return "";
        int size = number(header, 6, 4, true);
        byte[] tag = read(stream, size);
        if (tag.length != size) throw new IOException("Incomplete ID3 tag");
        if ((header[5] & 0x80) != 0 && version < 4) {
            ByteArrayOutputStream plain = new ByteArrayOutputStream();
            for (int i = 0; i < tag.length; i++) {
                plain.write(tag[i]);
                if ((tag[i] & 255) == 255 && i + 1 < tag.length && tag[i + 1] == 0) i++;
            }
            tag = plain.toByteArray();
        }
        int offset = 0;
        if ((header[5] & 0x40) != 0 && version >= 3) {
            if (tag.length < 4) throw new IOException("Invalid extended ID3 header");
            offset = number(tag, 0, 4, version == 4) + (version == 3 ? 4 : 0);
        }
        int frameHeader = version == 2 ? 6 : 10;
        while (offset + frameHeader <= tag.length && tag[offset] != 0) {
            String id = new String(tag, offset, version == 2 ? 3 : 4, StandardCharsets.ISO_8859_1);
            int length = number(tag, offset + (version == 2 ? 3 : 4), version == 2 ? 3 : 4, version == 4);
            if (length <= 0 || length > tag.length - offset - frameHeader) throw new IOException("Invalid ID3 frame");
            int flags = version == 2 ? 0 : tag[offset + 9] & 255;
            boolean unsupported = version == 3 ? (flags & 0xe0) != 0 : version == 4 && (flags & 0x4d) != 0;
            if ((id.equals("USLT") || id.equals("ULT")) && !unsupported) {
                byte[] data = Arrays.copyOfRange(tag, offset + frameHeader, offset + frameHeader + length);
                if (version == 4 && ((header[5] & 0x80) != 0 || (flags & 2) != 0)) {
                    ByteArrayOutputStream plain = new ByteArrayOutputStream();
                    for (int i = 0; i < data.length; i++) {
                        plain.write(data[i]);
                        if ((data[i] & 255) == 255 && i + 1 < data.length && data[i + 1] == 0) i++;
                    }
                    data = plain.toByteArray();
                }
                if (data.length < 5) return "";
                int encoding = data[0] & 255;
                Charset charset;
                switch (encoding) {
                    case 0: charset = StandardCharsets.ISO_8859_1; break;
                    case 1: charset = StandardCharsets.UTF_16; break;
                    case 2: charset = StandardCharsets.UTF_16BE; break;
                    case 3: charset = StandardCharsets.UTF_8; break;
                    default: throw new IOException("Unsupported lyrics encoding");
                }
                int start = 4, step = encoding == 1 || encoding == 2 ? 2 : 1;
                while (start + step <= data.length) {
                    if (data[start] == 0 && (step == 1 || data[start + 1] == 0)) {
                        int textStart = start + step;
                        if (encoding == 1 && textStart + 1 < data.length &&
                            !((data[textStart] == (byte) 0xff && data[textStart + 1] == (byte) 0xfe)
                              || (data[textStart] == (byte) 0xfe && data[textStart + 1] == (byte) 0xff))) {
                            charset = data[4] == (byte) 0xff && data[5] == (byte) 0xfe
                                ? StandardCharsets.UTF_16LE : StandardCharsets.UTF_16BE;
                        }
                        return new String(data, textStart, data.length - textStart, charset).replace("\u0000", "").trim();
                    }
                    start += step;
                }
            }
            offset += frameHeader + length;
        }
        return "";
    }
    /** Returns genuine ID3 SYLT timestamps as LRC; never invents timestamps for USLT. */
    static String readSynced(InputStream stream) throws IOException {
        if (stream == null) throw new IOException("Media is not readable");
        byte[] header = read(stream, 10);
        if (header.length < 10 || header[0] != 'I' || header[1] != 'D' || header[2] != '3') return "";
        int version = header[3] & 255;
        if (version < 2 || version > 4 || (header[5] & 0x40) != 0 && version == 2) return "";
        int size = number(header, 6, 4, true);
        byte[] tag = read(stream, size);
        if (tag.length != size) throw new IOException("Incomplete ID3 tag");
        if ((header[5] & 0x80) != 0 && version < 4) {
            ByteArrayOutputStream plain = new ByteArrayOutputStream();
            for (int i = 0; i < tag.length; i++) {
                plain.write(tag[i]);
                if ((tag[i] & 255) == 255 && i + 1 < tag.length && tag[i + 1] == 0) i++;
            }
            tag = plain.toByteArray();
        }
        int offset = 0;
        if ((header[5] & 0x40) != 0 && version >= 3) {
            if (tag.length < 4) throw new IOException("Invalid extended ID3 header");
            offset = number(tag, 0, 4, version == 4) + (version == 3 ? 4 : 0);
        }
        int frameHeader = version == 2 ? 6 : 10;
        while (offset + frameHeader <= tag.length && tag[offset] != 0) {
            String id = new String(tag, offset, version == 2 ? 3 : 4, StandardCharsets.ISO_8859_1);
            int length = number(tag, offset + (version == 2 ? 3 : 4), version == 2 ? 3 : 4, version == 4);
            if (length <= 0 || length > tag.length - offset - frameHeader) throw new IOException("Invalid ID3 frame");
            int flags = version == 2 ? 0 : tag[offset + 9] & 255;
            boolean unsupported = version == 3 ? (flags & 0xe0) != 0 : version == 4 && (flags & 0x4d) != 0;
            if ((id.equals("SYLT") || id.equals("SLT")) && !unsupported) {
                byte[] frame = Arrays.copyOfRange(tag, offset + frameHeader, offset + frameHeader + length);
                if (version == 4 && (flags & 2) != 0) {
                    ByteArrayOutputStream plain = new ByteArrayOutputStream();
                    for (int i = 0; i < frame.length; i++) {
                        plain.write(frame[i]);
                        if ((frame[i] & 255) == 255 && i + 1 < frame.length && frame[i + 1] == 0) i++;
                    }
                    frame = plain.toByteArray();
                }
                return parseSyncedFrame(frame);
            }
            offset += frameHeader + length;
        }
        return "";
    }

    private static String parseSyncedFrame(byte[] data) throws IOException {
        if (data.length < 7) return "";
        int encoding = data[0] & 255;
        Charset charset;
        switch (encoding) {
            case 0: charset = StandardCharsets.ISO_8859_1; break;
            case 1: charset = StandardCharsets.UTF_16; break;
            case 2: charset = StandardCharsets.UTF_16BE; break;
            case 3: charset = StandardCharsets.UTF_8; break;
            default: throw new IOException("Unsupported ID3 lyrics encoding");
        }
        int step = encoding == 1 || encoding == 2 ? 2 : 1;
        int offset = 6; // encoding, language[3], timestamp format, content type
        while (offset + step <= data.length && !(data[offset] == 0 && (step == 1 || data[offset + 1] == 0))) offset += step;
        if (offset + step > data.length) return "";
        offset += step;
        ByteArrayOutputStream lrc = new ByteArrayOutputStream();
        int timestampFormat = data[4] & 255;
        while (offset < data.length) {
            int textStart = offset;
            while (offset + step <= data.length && !(data[offset] == 0 && (step == 1 || data[offset + 1] == 0))) offset += step;
            if (offset + step > data.length || offset + step + 4 > data.length) break;
            int textEnd = offset;
            offset += step;
            String lyric = new String(data, textStart, textEnd - textStart, charset).replace("", "").trim();
            long timestamp = ((long)(data[offset] & 255) << 24) | ((long)(data[offset + 1] & 255) << 16)
                | ((long)(data[offset + 2] & 255) << 8) | (long)(data[offset + 3] & 255);
            offset += 4;
            if (lyric.isEmpty() || (timestampFormat != 1 && timestampFormat != 2)) continue;
            long milliseconds = timestampFormat == 1 ? Math.round(timestamp * 1000.0 / 75.0) : timestamp;
            long minutes = milliseconds / 60000;
            long seconds = (milliseconds / 1000) % 60;
            long centiseconds = (milliseconds % 1000) / 10;
            byte[] line = String.format(java.util.Locale.ROOT, "[%02d:%02d.%02d] %s\n", minutes, seconds, centiseconds, lyric).getBytes(StandardCharsets.UTF_8);
            lrc.write(line);
        }
        return new String(lrc.toByteArray(), StandardCharsets.UTF_8).trim();
    }

}
