/*
 * Small streaming feature extractor for Android's raw `screencap` output.
 *
 * The Android build is a static, libc-free AArch64 ELF. It reads the 16-byte
 * screencap header plus RGBA8888 rows from stdin and stops as soon as the ROI
 * is complete. No screenshot bytes need to cross adb:
 *
 *   screencap | /data/local/tmp/fnaf-screencheck stats 100 40 300 100 2
 *
 * A normal host build is also supported for tests and calibration against
 * ffmpeg RGBA frames:
 *
 *   cc -O2 screencheck.c -o screencheck
 *   ffmpeg ... -pix_fmt rgba -f rawvideo - | \
 *     ./screencheck stats --rgba 1280 576 0 0 1280 576 4
 */

typedef unsigned char u8;
typedef unsigned int u32;
typedef unsigned long long u64;
typedef unsigned long usize;
typedef long isize;

#define STDIN_FD 0
#define STDOUT_FD 1
#define STDERR_FD 2
#define EINTR_VALUE 4
#define MAX_WIDTH 16384
#define ROW_CAPACITY (MAX_WIDTH * 4)
#define MODEL_CAPACITY 65536
#define MODEL_HEADER_SIZE 32
#define MODEL_LABEL_SIZE 16
#define MAX_GRID_CELLS 256
#define MAX_FEATURES (3 + MAX_GRID_CELLS * 3)
#define MAX_TEMPLATES 64

static u8 row_buffer[ROW_CAPACITY];
static char output_buffer[512];
static u8 model_buffer[MODEL_CAPACITY];
static u8 x_bins[MAX_WIDTH];
static u8 feature_vector[MAX_FEATURES];
static u64 tile_red[MAX_GRID_CELLS];
static u64 tile_green[MAX_GRID_CELLS];
static u64 tile_blue[MAX_GRID_CELLS];
static u32 tile_count[MAX_GRID_CELLS];
static u32 template_scores[MAX_TEMPLATES];

#ifdef SCREENCHECK_FREESTANDING
static isize system_read(int fd, void *buffer, usize count) {
    register long x0 __asm__("x0") = fd;
    register void *x1 __asm__("x1") = buffer;
    register usize x2 __asm__("x2") = count;
    register long x8 __asm__("x8") = 63;
    __asm__ volatile("svc #0" : "+r"(x0) : "r"(x1), "r"(x2), "r"(x8) : "memory");
    return (isize)x0;
}

static isize system_write(int fd, const void *buffer, usize count) {
    register long x0 __asm__("x0") = fd;
    register const void *x1 __asm__("x1") = buffer;
    register usize x2 __asm__("x2") = count;
    register long x8 __asm__("x8") = 64;
    __asm__ volatile("svc #0" : "+r"(x0) : "r"(x1), "r"(x2), "r"(x8) : "memory");
    return (isize)x0;
}

static int system_open(const char *path) {
    register long x0 __asm__("x0") = -100;
    register const char *x1 __asm__("x1") = path;
    register long x2 __asm__("x2") = 0;
    register long x3 __asm__("x3") = 0;
    register long x8 __asm__("x8") = 56;
    __asm__ volatile("svc #0" : "+r"(x0) : "r"(x1), "r"(x2), "r"(x3), "r"(x8) : "memory");
    return (int)x0;
}

static void system_close(int fd) {
    register long x0 __asm__("x0") = fd;
    register long x8 __asm__("x8") = 57;
    __asm__ volatile("svc #0" : "+r"(x0) : "r"(x8) : "memory");
}
#else
#include <fcntl.h>
#include <unistd.h>
static isize system_read(int fd, void *buffer, usize count) {
    return (isize)read(fd, buffer, count);
}
static isize system_write(int fd, const void *buffer, usize count) {
    return (isize)write(fd, buffer, count);
}
static int system_open(const char *path) {
    return open(path, O_RDONLY);
}
static void system_close(int fd) {
    close(fd);
}
#endif

static usize string_length(const char *text) {
    usize length = 0;
    while (text[length]) length++;
    return length;
}

static int strings_equal(const char *left, const char *right) {
    while (*left && *right && *left == *right) {
        left++;
        right++;
    }
    return *left == *right;
}

static void write_all(int fd, const char *buffer, usize count) {
    while (count) {
        isize written = system_write(fd, buffer, count);
        if (written == -EINTR_VALUE) continue;
        if (written <= 0) return;
        buffer += written;
        count -= (usize)written;
    }
}

static void write_text(int fd, const char *text) {
    write_all(fd, text, string_length(text));
}

static int read_exact_fd(int fd, void *buffer, usize count) {
    u8 *destination = (u8 *)buffer;
    while (count) {
        isize received = system_read(fd, destination, count);
        if (received == -EINTR_VALUE) continue;
        if (received <= 0) return 0;
        destination += received;
        count -= (usize)received;
    }
    return 1;
}

static int read_exact(void *buffer, usize count) {
    return read_exact_fd(STDIN_FD, buffer, count);
}

static isize read_file(const char *path, u8 *buffer, usize capacity) {
    int fd = system_open(path);
    usize used = 0;
    if (fd < 0) return -1;
    while (used < capacity) {
        isize received = system_read(fd, buffer + used, capacity - used);
        if (received == -EINTR_VALUE) continue;
        if (received < 0) {
            system_close(fd);
            return -1;
        }
        if (received == 0) {
            system_close(fd);
            return (isize)used;
        }
        used += (usize)received;
    }
    {
        u8 extra;
        isize received = system_read(fd, &extra, 1);
        system_close(fd);
        return received == 0 ? (isize)used : -2;
    }
}

static int parse_u32(const char *text, u32 *value) {
    u64 parsed = 0;
    if (!*text) return 0;
    while (*text) {
        if (*text < '0' || *text > '9') return 0;
        parsed = parsed * 10 + (u32)(*text - '0');
        if (parsed > 0xffffffffULL) return 0;
        text++;
    }
    *value = (u32)parsed;
    return 1;
}

static u32 read_le_u32(const u8 *bytes) {
    return (u32)bytes[0]
        | ((u32)bytes[1] << 8)
        | ((u32)bytes[2] << 16)
        | ((u32)bytes[3] << 24);
}

static u32 read_le_u16(const u8 *bytes) {
    return (u32)bytes[0] | ((u32)bytes[1] << 8);
}

static char *append_text(char *destination, const char *text) {
    while (*text) *destination++ = *text++;
    return destination;
}

static char *append_u64(char *destination, u64 value) {
    char reverse[24];
    u32 count = 0;
    do {
        reverse[count++] = (char)('0' + value % 10);
        value /= 10;
    } while (value);
    while (count) *destination++ = reverse[--count];
    return destination;
}

static char *append_label(char *destination, const u8 *label) {
    u32 index;
    for (index = 0; index < MODEL_LABEL_SIZE && label[index]; index++)
        *destination++ = (char)label[index];
    return destination;
}

static u32 absolute_difference(u32 left, u32 right) {
    return left > right ? left - right : right - left;
}

static int labels_equal(const u8 *left, const u8 *right) {
    u32 index;
    for (index = 0; index < MODEL_LABEL_SIZE; index++)
        if (left[index] != right[index]) return 0;
    return 1;
}

static u8 centered_feature(u64 total, u32 count, u32 global_mean) {
    long centered = (long)(total / count) - (long)global_mean;
    if (centered < -128) centered = -128;
    if (centered > 127) centered = 127;
    return (u8)(centered + 128);
}

static int valid_label(const u8 *label) {
    u32 index;
    int ended = 0;
    if (!label[0]) return 0;
    for (index = 0; index < MODEL_LABEL_SIZE; index++) {
        u8 c = label[index];
        if (!c) {
            ended = 1;
            continue;
        }
        if (ended) return 0;
        if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
            || (c >= '0' && c <= '9') || c == '-' || c == '_')) return 0;
    }
    return ended;
}

static int usage(void) {
    write_text(STDERR_FD,
        "usage:\n"
        "  screencheck stats [--rgba W H] X0 Y0 X1 Y1 STEP\n"
        "  screencheck count [--rgba W H] X0 Y0 X1 Y1 STEP R0 R1 G0 G1 B0 B1\n"
        "  screencheck match [--rgba W H] X0 Y0 X1 Y1 STEP R0 R1 G0 G1 B0 B1 MIN_BPS\n"
        "  screencheck classify MODEL [--rgba W H]\n"
        "default input is Android raw screencap (16-byte header + RGBA8888)\n");
    return 2;
}

int screencheck_main(int argc, char **argv) {
    enum { MODE_STATS, MODE_COUNT, MODE_MATCH, MODE_CLASSIFY } mode;
    u32 raw_width = 0, raw_height = 0;
    int raw_input = 0;
    u32 x0, y0, x1, y1, step;
    u32 ranges[6] = {0, 255, 0, 255, 0, 255};
    u32 minimum_basis_points = 0;
    u32 width, height, pixel_format = 1;
    u32 argument = 2;
    u32 expected_arguments;
    isize model_length = 0;
    usize model_expected_size = 0;
    u32 model_width = 0, model_height = 0;
    u32 grid_columns = 0, grid_rows = 0, grid_cells = 0;
    u32 mean_weight = 0, template_count = 0;
    u32 model_max_score = 0, model_min_margin = 0;
    u32 model_feature_count = 0, model_record_size = 0;
    u8 header[16];
    u64 samples = 0, red_total = 0, green_total = 0, blue_total = 0;
    u64 luma_total = 0, dark_count = 0, bright_count = 0;
    u64 matching_count = 0, edge_total = 0, edge_count = 0;
    u32 y;

    if (argc < 2) return usage();
    if (strings_equal(argv[1], "stats")) mode = MODE_STATS;
    else if (strings_equal(argv[1], "count")) mode = MODE_COUNT;
    else if (strings_equal(argv[1], "match")) mode = MODE_MATCH;
    else if (strings_equal(argv[1], "classify")) mode = MODE_CLASSIFY;
    else return usage();

    if (mode == MODE_CLASSIFY) {
        u32 index;
        if (argc != 3 && argc != 6) return usage();
        if (argc == 6) {
            if (!strings_equal(argv[3], "--rgba")
                || !parse_u32(argv[4], &raw_width)
                || !parse_u32(argv[5], &raw_height)) return usage();
            raw_input = 1;
        }
        model_length = read_file(argv[2], model_buffer, MODEL_CAPACITY);
        if (model_length == -2) {
            write_text(STDERR_FD, "screencheck: model is too large\n");
            return 3;
        }
        if (model_length < MODEL_HEADER_SIZE) {
            write_text(STDERR_FD, "screencheck: cannot read model\n");
            return 3;
        }
        if (model_buffer[0] != 'S' || model_buffer[1] != 'C'
            || model_buffer[2] != 'M' || model_buffer[3] != '1'
            || read_le_u16(model_buffer + 4) != MODEL_HEADER_SIZE) {
            write_text(STDERR_FD, "screencheck: unsupported model format\n");
            return 3;
        }
        model_width = read_le_u16(model_buffer + 6);
        model_height = read_le_u16(model_buffer + 8);
        x0 = read_le_u16(model_buffer + 10);
        y0 = read_le_u16(model_buffer + 12);
        x1 = read_le_u16(model_buffer + 14);
        y1 = read_le_u16(model_buffer + 16);
        step = model_buffer[18];
        grid_columns = model_buffer[19];
        grid_rows = model_buffer[20];
        mean_weight = model_buffer[21];
        template_count = model_buffer[22];
        model_max_score = read_le_u16(model_buffer + 24);
        model_min_margin = read_le_u16(model_buffer + 26);
        grid_cells = grid_columns * grid_rows;
        model_feature_count = 3 + grid_cells * 3;
        model_record_size = MODEL_LABEL_SIZE + model_feature_count;
        model_expected_size = MODEL_HEADER_SIZE
            + (usize)template_count * model_record_size;
        if (!model_width || model_width > MAX_WIDTH
            || !model_height || model_height > MAX_WIDTH
            || !step || !grid_columns || !grid_rows
            || grid_cells > MAX_GRID_CELLS
            || !template_count || template_count > MAX_TEMPLATES
            || mean_weight > 32 || model_max_score > 255
            || model_min_margin > 255
            || x0 >= x1 || y0 >= y1 || x1 > model_width || y1 > model_height
            || model_expected_size != (usize)model_length) {
            write_text(STDERR_FD, "screencheck: invalid model geometry\n");
            return 3;
        }
        for (index = 0; index < template_count; index++) {
            const u8 *label = model_buffer + MODEL_HEADER_SIZE
                + (usize)index * model_record_size;
            if (!valid_label(label)) {
                write_text(STDERR_FD, "screencheck: invalid model label\n");
                return 3;
            }
        }
    } else {
        if (argument < (u32)argc && strings_equal(argv[argument], "--rgba")) {
            if (argument + 2 >= (u32)argc
                || !parse_u32(argv[argument + 1], &raw_width)
                || !parse_u32(argv[argument + 2], &raw_height)) return usage();
            argument += 3;
            raw_input = 1;
        }

        expected_arguments = argument + 5;
        if (mode != MODE_STATS) expected_arguments += 6;
        if (mode == MODE_MATCH) expected_arguments += 1;
        if ((u32)argc != expected_arguments) return usage();

        if (!parse_u32(argv[argument++], &x0)
            || !parse_u32(argv[argument++], &y0)
            || !parse_u32(argv[argument++], &x1)
            || !parse_u32(argv[argument++], &y1)
            || !parse_u32(argv[argument++], &step)) return usage();
        if (mode != MODE_STATS) {
            u32 index;
            for (index = 0; index < 6; index++) {
                if (!parse_u32(argv[argument++], &ranges[index]) || ranges[index] > 255)
                    return usage();
            }
            if (ranges[0] > ranges[1] || ranges[2] > ranges[3] || ranges[4] > ranges[5])
                return usage();
        }
        if (mode == MODE_MATCH) {
            if (!parse_u32(argv[argument], &minimum_basis_points)
                || minimum_basis_points > 10000) return usage();
        }
    }

    if (raw_input) {
        width = raw_width;
        height = raw_height;
    } else {
        if (!read_exact(header, sizeof(header))) {
            write_text(STDERR_FD, "screencheck: truncated screencap header\n");
            return 3;
        }
        width = read_le_u32(header);
        height = read_le_u32(header + 4);
        pixel_format = read_le_u32(header + 8);
    }

    if (!width || width > MAX_WIDTH || !height || height > MAX_WIDTH
        || (pixel_format != 1 && pixel_format != 2)) {
        write_text(STDERR_FD, "screencheck: expected an RGBA8888/RGBX8888 screencap\n");
        return 3;
    }
    if (mode == MODE_CLASSIFY && (width != model_width || height != model_height)) {
        write_text(STDERR_FD, "screencheck: frame size does not match model\n");
        return 3;
    }
    if (!step || x0 >= x1 || y0 >= y1 || x1 > width || y1 > height) {
        write_text(STDERR_FD, "screencheck: ROI is outside the input frame\n");
        return 2;
    }

    if (mode == MODE_CLASSIFY) {
        u32 x;
        for (x = x0; x < x1; x++) {
            u32 bin = (x - x0) * grid_columns / (x1 - x0);
            x_bins[x] = (u8)(bin < grid_columns ? bin : grid_columns - 1);
        }
    }

    for (y = 0; y < y1; y++) {
        u32 x;
        u32 tile_y = 0;
        u32 previous_luma = 0;
        int have_previous = 0;
        if (!read_exact(row_buffer, (usize)width * 4)) {
            write_text(STDERR_FD, "screencheck: truncated RGBA frame\n");
            return 3;
        }
        if (y < y0 || (y - y0) % step) continue;
        if (mode == MODE_CLASSIFY) {
            tile_y = (y - y0) * grid_rows / (y1 - y0);
            if (tile_y >= grid_rows) tile_y = grid_rows - 1;
        }
        for (x = x0; x < x1; x += step) {
            const u8 *pixel = row_buffer + (usize)x * 4;
            u32 red = pixel[0], green = pixel[1], blue = pixel[2];
            u32 luma = (77 * red + 150 * green + 29 * blue) >> 8;
            samples++;
            red_total += red;
            green_total += green;
            blue_total += blue;
            luma_total += luma;
            if (luma < 48) dark_count++;
            if (luma > 192) bright_count++;
            if (have_previous) {
                edge_total += absolute_difference(luma, previous_luma);
                edge_count++;
            }
            previous_luma = luma;
            have_previous = 1;
            if (red >= ranges[0] && red <= ranges[1]
                && green >= ranges[2] && green <= ranges[3]
                && blue >= ranges[4] && blue <= ranges[5]) matching_count++;
            if (mode == MODE_CLASSIFY) {
                u32 tile = tile_y * grid_columns + x_bins[x];
                tile_red[tile] += red;
                tile_green[tile] += green;
                tile_blue[tile] += blue;
                tile_count[tile]++;
            }
        }
    }

    if (!samples) {
        write_text(STDERR_FD, "screencheck: ROI produced no samples\n");
        return 2;
    }

    if (mode == MODE_CLASSIFY) {
        u32 index, best_index = 0;
        u32 best_score = 0xffffffffU, second_score = 0xffffffffU;
        u32 global_red = (u32)(red_total / samples);
        u32 global_green = (u32)(green_total / samples);
        u32 global_blue = (u32)(blue_total / samples);
        u32 denominator = 3 * mean_weight + grid_cells * 3;
        const u8 *best_label;
        u32 margin;
        feature_vector[0] = (u8)global_red;
        feature_vector[1] = (u8)global_green;
        feature_vector[2] = (u8)global_blue;
        for (index = 0; index < grid_cells; index++) {
            u32 feature = 3 + index * 3;
            if (!tile_count[index]) {
                write_text(STDERR_FD, "screencheck: model grid is finer than its sampled ROI\n");
                return 3;
            }
            feature_vector[feature] = centered_feature(
                tile_red[index], tile_count[index], global_red);
            feature_vector[feature + 1] = centered_feature(
                tile_green[index], tile_count[index], global_green);
            feature_vector[feature + 2] = centered_feature(
                tile_blue[index], tile_count[index], global_blue);
        }
        for (index = 0; index < template_count; index++) {
            const u8 *record = model_buffer + MODEL_HEADER_SIZE
                + (usize)index * model_record_size;
            const u8 *model_features = record + MODEL_LABEL_SIZE;
            u64 distance = 0;
            u32 feature;
            distance += (u64)absolute_difference(feature_vector[0], model_features[0])
                * mean_weight;
            distance += (u64)absolute_difference(feature_vector[1], model_features[1])
                * mean_weight;
            distance += (u64)absolute_difference(feature_vector[2], model_features[2])
                * mean_weight;
            for (feature = 3; feature < model_feature_count; feature++)
                distance += absolute_difference(feature_vector[feature], model_features[feature]);
            template_scores[index] = (u32)((distance + denominator / 2) / denominator);
            if (template_scores[index] < best_score) {
                best_score = template_scores[index];
                best_index = index;
            }
        }
        best_label = model_buffer + MODEL_HEADER_SIZE
            + (usize)best_index * model_record_size;
        for (index = 0; index < template_count; index++) {
            const u8 *label = model_buffer + MODEL_HEADER_SIZE
                + (usize)index * model_record_size;
            if (!labels_equal(label, best_label) && template_scores[index] < second_score)
                second_score = template_scores[index];
        }
        margin = second_score == 0xffffffffU ? 255
            : second_score > best_score ? second_score - best_score : 0;
        {
            char *out = output_buffer;
            if (best_score > model_max_score || margin < model_min_margin)
                out = append_text(out, "unknown");
            else
                out = append_label(out, best_label);
            out = append_text(out, " score=");
            out = append_u64(out, best_score);
            out = append_text(out, " margin=");
            out = append_u64(out, margin);
            *out++ = '\n';
            write_all(STDOUT_FD, output_buffer, (usize)(out - output_buffer));
        }
    } else if (mode == MODE_STATS) {
        char *out = output_buffer;
        out = append_text(out, "samples=");
        out = append_u64(out, samples);
        out = append_text(out, " mean_rgb=");
        out = append_u64(out, red_total / samples);
        *out++ = ',';
        out = append_u64(out, green_total / samples);
        *out++ = ',';
        out = append_u64(out, blue_total / samples);
        out = append_text(out, " mean_luma=");
        out = append_u64(out, luma_total / samples);
        out = append_text(out, " dark_bps=");
        out = append_u64(out, dark_count * 10000 / samples);
        out = append_text(out, " bright_bps=");
        out = append_u64(out, bright_count * 10000 / samples);
        out = append_text(out, " horizontal_edge=");
        out = append_u64(out, edge_count ? edge_total / edge_count : 0);
        *out++ = '\n';
        write_all(STDOUT_FD, output_buffer, (usize)(out - output_buffer));
    } else {
        u64 basis_points = matching_count * 10000 / samples;
        if (mode == MODE_COUNT) {
            char *out = append_u64(output_buffer, basis_points);
            *out++ = '\n';
            write_all(STDOUT_FD, output_buffer, (usize)(out - output_buffer));
        } else {
            write_text(STDOUT_FD,
                basis_points >= minimum_basis_points ? "match\n" : "clear\n");
        }
    }
    return 0;
}

#ifndef SCREENCHECK_FREESTANDING
int main(int argc, char **argv) {
    return screencheck_main(argc, argv);
}
#endif
