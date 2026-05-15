import '../models/lrc_line.dart';

/// 표준 LRC 포맷 파서. `[mm:ss.xx]가사` 패턴.
/// 메타데이터 라인([ti:...], [ar:...] 등)은 무시.
class LrcParser {
  static final _lineRe = RegExp(r'\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)');

  static List<LrcLine> parse(String raw) {
    final out = <LrcLine>[];
    for (final rawLine in raw.split(RegExp(r'\r?\n'))) {
      final line = rawLine.trim();
      if (line.isEmpty) continue;
      /* 한 줄에 여러 타임스탬프가 붙는 경우도 지원: [00:12.34][00:34.56]가사 */
      final matches = _lineRe.allMatches(line).toList();
      if (matches.isEmpty) continue;
      final text = matches.last.group(4)?.trim() ?? '';
      if (text.isEmpty) continue;
      for (final m in matches) {
        final min = int.parse(m.group(1)!);
        final sec = int.parse(m.group(2)!);
        final fracStr = m.group(3);
        int ms = 0;
        if (fracStr != null) {
          /* "34" → 340ms, "345" → 345ms */
          ms = int.parse(fracStr.padRight(3, '0').substring(0, 3));
        }
        out.add(LrcLine(Duration(minutes: min, seconds: sec, milliseconds: ms), text));
      }
    }
    out.sort((a, b) => a.time.compareTo(b.time));
    return out;
  }

  /// 사장님 곡 JSON의 `lyrics` 문자열 파서.
  /// 형식: `[mm:ss.xx]한국어 / 영어` (슬래시 구분) — 미리보기용으로 `한국어\n영어` 합침.
  /// 슬래시 없는 라인(예: `(Instrumental Intro)`)은 그대로.
  static List<LrcLine> parseLyrics(String raw) {
    return parse(raw).map((l) {
      if (!l.text.contains(' / ')) return l;
      final merged = l.text
          .split(' / ')
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .join('\n');
      return LrcLine(l.time, merged);
    }).toList();
  }

  /// 현재 재생 위치(position)에서 활성 줄 인덱스.
  /// position 이하의 마지막 라인을 active로.
  static int activeIndex(List<LrcLine> lines, Duration position) {
    if (lines.isEmpty) return -1;
    int lo = 0, hi = lines.length - 1, idx = -1;
    while (lo <= hi) {
      final mid = (lo + hi) >> 1;
      if (lines[mid].time <= position) {
        idx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return idx;
  }
}
