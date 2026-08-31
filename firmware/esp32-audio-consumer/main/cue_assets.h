#ifndef FNAF2_CUE_ASSETS_H
#define FNAF2_CUE_ASSETS_H

#include <stddef.h>
#include <stdint.h>

typedef struct {
    uint16_t handle;
    uint16_t sample_count;
    const int16_t *pcm;
} fnaf2_cue_asset_t;

extern const fnaf2_cue_asset_t fnaf2_cue_assets[];
extern const size_t fnaf2_cue_asset_count;
extern const char fnaf2_cue_asset_manifest_sha256[];
extern const uint16_t fnaf2_cue_asset_handles[];

#endif
