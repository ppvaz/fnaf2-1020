# shellcheck shell=bash
sleep_ms() {
  ms=$1
  # 1000 + remainder, then strip the leading 1: a zero-padded fraction with no
  # $(printf ...) around it. Command substitution is a subshell, a subshell is
  # a fork, and a fork on this handset is ~21 ms -- the cost this file exists
  # to stop paying.
  ms_frac=$((1000 + ms % 1000))
  sleep "$((ms / 1000)).${ms_frac#1}"
}

# Runner-relative milliseconds, without a fork.
#
# `date +%s%3N` is fork+exec and costs about 21 ms on this handset: 100 calls
# took 2126 ms, and consecutive calls in a tight loop sit 22.2 ms apart on
# average (max 35). That is not a device floor -- it is the fork. `read` with a
# redirect from /proc/uptime is a shell builtin, no fork, 0.36 ms per read
# (100 reads in 36 ms), 58x cheaper. It is also monotonic, which an epoch clock
# is not: `date` can step under NTP or a settimeofday and take the schedule
# with it.
#
# Resolution is centiseconds, so this answers in 10 ms ticks. Measured against
# the shipped date-based wait over 20 targets while a night was live, landing
# error went from 34-73 ms late to 0 -- where 0 means "inside one 10 ms tick",
# not sub-millisecond. That 49-106 ms spread over the wider set is the same
# number HID-MULTITOUCH.md records as the macro anchor spread; it was the fork
# all along.
#
# This sets NOW_REL instead of echoing, because capturing an echo needs $( ),
# which is a subshell, which is the fork.
#
# 10#$c is not decoration: /proc/uptime prints two decimals, so a hundredths
# field of `08` or `09` is read as octal and the arithmetic aborts.
now_rel() {
  read nr_u nr_rest < /proc/uptime
  NOW_REL=$(( (${nr_u%.*} * 100 + 10#${nr_u#*.}) * 10 - T0_UP_MS ))
}

# Android's mksh arithmetic is signed 32-bit on this handset. Epoch
# milliseconds are already ~1.8e12, so direct arithmetic wraps. Split seconds
# from the last three digits and keep every arithmetic operand bounded.
epoch_sub_ms() {                              # EPOCH_MS DELTA_MS
  esm_seconds=${1%???}; esm_millis=${1#"$esm_seconds"}; esm_delta=$2
  esm_seconds=$((esm_seconds - esm_delta / 1000))
  esm_millis=$((10#$esm_millis - esm_delta % 1000))
  if [ "$esm_millis" -lt 0 ]; then
    esm_seconds=$((esm_seconds - 1)); esm_millis=$((esm_millis + 1000))
  fi
  esm_padded=$((1000 + esm_millis))
  EPOCH_SUB_RESULT="${esm_seconds}${esm_padded#1}"
}

epoch_diff_ms() {                             # LATER_EPOCH_MS EARLIER_EPOCH_MS
  edm_later_s=${1%???}; edm_later_ms=${1#"$edm_later_s"}
  edm_earlier_s=${2%???}; edm_earlier_ms=${2#"$edm_earlier_s"}
  EPOCH_DIFF_RESULT=$((
    (edm_later_s - edm_earlier_s) * 1000 +
    10#$edm_later_ms - 10#$edm_earlier_ms
  ))
}

printf '%s\n' "$$" > "$PIDFILE"
