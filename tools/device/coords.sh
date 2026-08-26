# FNaF 2 Android (v2.0.7) touch calibration — Moto g56 5G, 2400x1080 landscape.
#
# These coordinates depend on the game's OPTIONS as much as on the handset, and
# nothing recorded that until 2026-08-26. Read off a fresh install of
# com.scottgames.fnaf2 v2.0.7 (versionCode 26), the defaults are:
#
#   Display Mode       Full        changes the drawn geometry and letterboxing
#   Perspective Effect On          shifts office pixels as the view pans, so
#                                  every screen model was built under it
#   Controller Size    120%        MOVES AND SCALES the on-screen controls, so
#                                  the mask/monitor/light taps below are only
#                                  valid at this setting
#   Vibrations         Off
#   Subtitles          Off, English, Forced Off
#
# Changing Controller Size or Display Mode invalidates the tap table; changing
# Perspective Effect invalidates the screen models. Recalibrate rather than
# assuming, and record the settings you calibrated under.
#
# One navigation note, learned by doing it: KEYCODE_BACK does not go up a menu
# in this build, it exits the game.
# Derived 2026-08-20 from labeled 100px grid overlays on device screenshots
# (see the session's *_grid.png captures). y stays <= 1020: the bottom ~40px
# band belongs to Android gesture navigation and can swallow taps.
TAP_CONTINUE="400 730"     # title: Continue
TAP_NEWGAME="400 640"
TAP_6TH="400 880"          # title: 6th Night
TAP_MUTE="545 78"          # in night: MUTE CALL
TAP_MONITOR="1780 1015"    # monitor toggle bar (right, white)
TAP_MASK="600 1015"        # mask toggle bar (left, pink)
TAP_CAM_LIGHT="350 615"    # camera feed light (hold); in office this is left vent
TAP_HALL="1200 540"        # office hallway interior / beam (hold)
WIND="430 845"             # CAM 11 feed: Wind Up Music Box (tap & hold)
TAP_CAM01="1415 805"
TAP_CAM02="1730 805"
TAP_CAM03="1415 710"
TAP_CAM04="1730 710"
TAP_CAM05="1425 935"
TAP_CAM06="1685 935"
TAP_CAM07="1775 615"
TAP_CAM08="1415 605"
TAP_CAM09="2150 555"
TAP_CAM10="2045 720"
TAP_CAM11="2275 685"
TAP_CAM12="2225 810"
