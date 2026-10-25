package com.adelapp.larkplayer;

/** Pure validation used by the native recovery and playback implementations. */
final class RecoveryPolicy {
    /** JSON may decode milliseconds as Integer, Long or Double. Never default bad input to zero. */
    static long milliseconds(Object raw) {
        if (!(raw instanceof Number))
            throw new IllegalArgumentException("Invalid media position");
        double value = ((Number) raw).doubleValue();
        if (Double.isNaN(value) || Double.isInfinite(value) || value < 0
            || value > 9007199254740991L || value != Math.rint(value))
            throw new IllegalArgumentException("Invalid media position");
        return ((Number) raw).longValue();
    }

    static long expiresAt(long date, int days) {
        long retention = days * 86400000L;
        return date > Long.MAX_VALUE - retention ? Long.MAX_VALUE : date + retention;
    }

    static long position(long saved, boolean sameTrack, long duration) {
        if (!sameTrack || saved < 0) return 0;
        return duration > 0 ? Math.min(saved, duration) : saved;
    }

    static boolean mediaUri(String id, String uri, String type) {
        if (id == null || uri == null || !("audio".equals(type) || "video".equals(type))) return false;
        if (uri.matches("content://media/(?:external|external_primary)/" + type + "/media/[1-9][0-9]*"))
            return id.equals(type + "-" + uri.substring(uri.lastIndexOf('/') + 1));
        return sharedMediaUri(id, uri, type);
    }

    /** Only app-owned imports are accepted outside the MediaStore authority. */
    static boolean sharedMediaUri(String id, String uri, String type) {
        if (id == null || uri == null || !("audio".equals(type) || "video".equals(type))) return false;
        String prefix = "audio".equals(type) ? "shared-" : "shared-video-";
        String folder = "audio".equals(type) ? "shared-audio" : "shared-video";
        if (!id.matches(java.util.regex.Pattern.quote(prefix) + "[0-9a-f]{32}")) return false;
        String token = id.substring(prefix.length());
        return uri.matches("content://com\\.adelapp\\.larkplayer\\.fileprovider/" + folder + "/"
            + token + "\\.[A-Za-z0-9]{1,8}");
    }
}
