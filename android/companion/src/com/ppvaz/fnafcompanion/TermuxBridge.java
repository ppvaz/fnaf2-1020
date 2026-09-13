package com.ppvaz.fnafcompanion;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

/**
 * Small loopback transport for the optional Termux HID worker.
 *
 * <p>The Play Store Termux build does not expose RUN_COMMAND, so the user
 * starts a bounded listener by pasting the generated command into Termux.
 * Only localhost is used and every stream starts with an app-generated token.
 * The APK remains the plan scheduler; Termux only owns the ADB/HID boundary.
 */
public final class TermuxBridge implements AutoCloseable {
    public static final int PORT = 49_712;

    private final String token;
    private Socket socket;
    private BufferedWriter writer;

    public TermuxBridge(String token) {
        if (token == null || !token.matches("[0-9a-f]{32}")) {
            throw new IllegalArgumentException("bridge token must be 32 lowercase hex characters");
        }
        this.token = token;
    }

    public synchronized void connect(int timeoutMs) throws IOException {
        if (isConnected()) return;
        Socket next = new Socket();
        next.setTcpNoDelay(true);
        next.connect(new InetSocketAddress("127.0.0.1", PORT), timeoutMs);
        BufferedWriter nextWriter = new BufferedWriter(new OutputStreamWriter(
                next.getOutputStream(), StandardCharsets.US_ASCII));
        nextWriter.write("AUTH ");
        nextWriter.write(token);
        nextWriter.write('\n');
        nextWriter.flush();
        socket = next;
        writer = nextWriter;
    }

    public synchronized boolean isConnected() {
        return socket != null && socket.isConnected() && !socket.isClosed()
                && writer != null;
    }

    public synchronized void send(String line) throws IOException {
        if (line == null || line.indexOf('\n') >= 0 || line.indexOf('\r') >= 0) {
            throw new IllegalArgumentException("bridge accepts one JSONL line");
        }
        if (!isConnected()) throw new IOException("Termux bridge is not connected");
        writer.write(line);
        writer.write('\n');
        writer.flush();
    }

    public synchronized void sendRelease() {
        try {
            send("{\"id\":92,\"command\":\"report\",\"report\":[1,2,0,0,0,0,0,0,0,0,0,0]}");
        } catch (IOException ignored) {
            // The peer may already have exited; closing the socket is still safe.
        }
    }

    public synchronized String command() {
        return "while true; do nc -l 127.0.0.1 " + PORT
                + " | { IFS= read -r auth; [ \"$auth\" = \"AUTH " + token
                + "\" ] || exit 1; adb wait-for-device >/dev/null 2>&1 || exit 1;"
                + " exec adb shell /system/bin/hid - >/dev/null 2>&1; }; done";
    }

    @Override
    public synchronized void close() {
        sendRelease();
        BufferedWriter oldWriter = writer;
        Socket oldSocket = socket;
        writer = null;
        socket = null;
        if (oldWriter != null) {
            try {
                oldWriter.close();
            } catch (IOException ignored) {
                // Socket close below is the authoritative shutdown.
            }
        }
        if (oldSocket != null) {
            try {
                oldSocket.close();
            } catch (IOException ignored) {
                // Already closed is a successful stop.
            }
        }
    }
}
