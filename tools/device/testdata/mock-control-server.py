#!/usr/bin/env python3
"""One-shot stand-in for the helper's control socket, for the forward transport.

Writes its listening port to the path given as the first argument, serves a
single authenticated request, then exits.
"""
import pathlib
import socket
import sys

SNAPSHOT = (
    "OK snapshotNs=9000 visual=OBSERVED seq=121 rgba=1,2,3 luma=2 ageUs=1200 "
    "content=2400x1080 visible=1 audio=OBSERVED frames=33000 rms=10 peak=21 "
    "readAgeUs=1000\n"
)

server = socket.socket()
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
server.bind(("127.0.0.1", 0))
server.listen(1)
pathlib.Path(sys.argv[1]).write_text(str(server.getsockname()[1]))

client, _ = server.accept()
with client:
    client.recv(4096)
    client.sendall(SNAPSHOT.encode("ascii"))
