#!/usr/bin/env python3
"""Protocol stand-in for the helper's control socket, for the forward transport.

Writes its listening port to the path given as the first argument, then answers
requests until it is killed. It mirrors the verbs the helper serves so the host
script is exercised end to end without a device.
"""
import pathlib
import socket
import sys

# Field-for-field with the device's `CaptureService.currentSnapshot()`, and with
# the loopback mock in mock-adb-cue-helper.sh. Both transports must answer the
# same shape or a consumer that works over one silently fails over the other.
#
# This lagged the device twice: `cam05_mean_luma=` when the 20x9 frame started carrying the
# CAM 05 block. Consumers parse this with a greedy sed whose groups are positional
# -- the trial's visual parser wants `.*luma=...*cam05_mean_luma=...*ageUs=...` -- so a
# missing field does not degrade the parse, it kills the match outright.
SNAPSHOT = (
    "OK snapshotNs=9000 visual=OBSERVED seq=121 rgba=1,2,3 luma=2 cam05_mean_luma=37 "
    "grey=142 "
    "ageUs=1200 content=2400x1080 visible=1 "
    "audio=EXTERNAL authority=audio-authority state=UNKNOWN "
    "reason=host-authority-not-connected"
)


def answer(request):
    field = request.split()
    if not field:
        return "ERROR unknown-verb"
    if field[0] == "GET":
        return SNAPSHOT
    if field[0] == "GRID":
        cells = "".join(
            "ffffff" if i == 123 else f"10{i % 256:02x}{(i * 7) % 256:02x}"
            for i in range(180))
        return "OK grid=20x9 seq=121 " + cells
    if field[0] == "WATCH" and len(field) == 3:
        if field[2] == "status":
            return "OK watch=OFF spec=" + "a" * 64 + " entries=4"
        return "OK watch=ACTIVE spec=" + "a" * 64 + " entries=4"
    if field[0] == "READ" and len(field) == 2:
        return ("OK read=OBSERVED spec=" + "a" * 64 +
                " seq=122 snapshotNs=10000 ageUs=1200 "
                "bb_left_luma=194 bb_left_yellowness=-111 "
                "cam05_mean_luma=37 screen_grey_cells=142")
    if field[0] in {"CAL", "LOG", "REC", "MODEL", "ARM", "RESULT"}:
        return "ERROR audio-authority-external"
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
