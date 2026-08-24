#!/usr/bin/env python3
"""Protocol stand-in for the helper's control socket, for the forward transport.

Writes its listening port to the path given as the first argument, then answers
requests until it is killed. It mirrors the verbs the helper serves so the host
script is exercised end to end without a device.
"""
import pathlib
import socket
import sys

SNAPSHOT = (
    "OK snapshotNs=9000 visual=OBSERVED seq=121 rgba=1,2,3 luma=2 ageUs=1200 "
    "content=2400x1080 visible=1 audio=OBSERVED frames=33000 rms=10 peak=21 "
    "readAgeUs=1000"
)


def answer(request):
    field = request.split()
    if not field:
        return "ERROR unknown-verb"
    if field[0] == "GET":
        return SNAPSHOT
    if field[0] == "CAL" and len(field) == 3:
        return "OK cal=" + field[2]
    if field[0] == "LOG" and len(field) == 3:
        if field[2] == "start":
            return "OK log=started max=480"
        return ("OK rec=cue-1700000000001-p0-q7.wav frames=112000 rate=16000 "
                "bytes=224044")
    if field[0] == "REC":
        return "OK rec=cue-1700000000000-p0-q1.wav frames=16000 rate=16000 bytes=32044"
    return "ERROR unknown-verb"


server = socket.socket()
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
server.bind(("127.0.0.1", 0))
server.listen(4)
pathlib.Path(sys.argv[1]).write_text(str(server.getsockname()[1]))

while True:
    client, _ = server.accept()
    with client:
        request = client.recv(4096).decode("ascii", "replace").strip()
        client.sendall((answer(request) + "\n").encode("ascii"))
