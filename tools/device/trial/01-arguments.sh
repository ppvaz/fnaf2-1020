set -eu
PIDFILE=$1; shift
# The plan travels beside the pidfile rather than as another positional: the
# host pushes it to the same name with a .plan suffix.
PLAN_FILE="$PIDFILE.plan"
READYFILE=$1; shift
STARTFILE=$1; shift
EPOCHFILE=$1; shift
CAPTURE_LOCK=$1; shift
DEVICE_EPOCH_LATCH=$1; shift
CYCLES=$1; shift
PRESS_MODE=$1; shift
HID_LEFT_SURVIVAL=$1; shift
HID_LEFT_DEBUG_RAW=$1; shift
NIGHT6_LEFT=$1; shift
PILOT_OFFSET_MS=$1; shift
HID_TRACE=$1; shift
[ "$HID_TRACE" != "-" ] || HID_TRACE=""
PLAN_SPACING_MS=$1; shift
PLAN_CONTACT_MS=$1; shift
HID_MODE=0
case "$PRESS_MODE" in
  hid|hid-multi) HID_MODE=1 ;;
esac
BB_CAM05_CAPTURE_EVERY=$1; shift
BB_CAM05_CAPTURE_START=$1; shift
BB_CAM05_UNLIT=$1; shift
BB_CAM05_STOP_ON_BB=$1; shift
BB_LEFT_CAPTURE_EVERY=$1; shift
BB_LEFT_CAPTURE_START=$1; shift
SAMPLE_DIR=$1; shift
CHECKER=${1:--}; shift
CAM05_MODEL=${1:--}; shift
BB_MODEL=${1:--}; shift
GF_MODEL=${1:--}; shift
GF_SKIP_MASK_ON_EXACT_EMPTY=$1; shift
POST_CAPTURE_TOUCHES=$1; shift
MUTE_X=$1; MUTE_Y=$2; shift 2
MONITOR_X=$1; MONITOR_Y=$2; shift 2
MASK_X=$1; MASK_Y=$2; shift 2
CAM_LIGHT_X=$1; CAM_LIGHT_Y=$2; shift 2
HALL_X=$1; HALL_Y=$2; shift 2
WIND_X=$1; WIND_Y=$2; shift 2
CAM10_X=$1; CAM10_Y=$2; shift 2
CAM04_X=$1; CAM04_Y=$2; shift 2
CAM07_X=$1; CAM07_Y=$2; shift 2
CAM09_X=$1; CAM09_Y=$2; shift 2
CAM11_X=$1; CAM11_Y=$2; shift 2
CAM05_X=$1; CAM05_Y=$2; shift 2
CUE_PORT=$1; CUE_TOKEN=$2; shift 2
KEEP_DIR=${1:-}
# Host->driver signal files (trial.sh stop_remote_driver / watch_arm_verify).
# All optional: an older caller that passes none simply never halts and never
# verifies, which is the pre-2026-08-29 behaviour.
HALT_FILE=${2:-}
ARM_WINDOW=${3:-}
REARM_FILE=${4:-}
ARMFAIL_FILE=${5:-}

if [ "$BB_CAM05_CAPTURE_EVERY" -gt 0 ] || [ "$BB_LEFT_CAPTURE_EVERY" -gt 0 ]; then
  mkdir -p "$SAMPLE_DIR"
fi

HID_PID=""
HID_FD_OPEN=0
