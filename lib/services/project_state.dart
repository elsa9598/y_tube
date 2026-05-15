import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:path/path.dart' as p;
import '../models/lrc_line.dart';
import 'lrc_parser.dart';

/// 앱 전역 프로젝트 상태.
/// 1페이지 → 2페이지 → 3페이지 공유.
///
/// 사장님 워크플로우: 폰에서 **mp4 + JSON** 두 파일 첨부.
///  - mp4  : 오디오 소스 + 첫 프레임이 1:1 이미지 (서버가 추출)
///  - JSON : {id, title, thumbnail, time, lyrics}. title/lyrics만 사용.
class ProjectState extends ChangeNotifier {
  // 입력 자산
  String? mp4Path;
  String? jsonPath;

  // JSON에서 파싱한 값 (미리보기 + 업로드 메타 기본값)
  String songTitle = '오둥이의 하루';
  List<LrcLine> lrcLines = const [];

  // mp4 메타 (just_audio가 채움 — 미리보기 재생용)
  Duration? audioDuration;

  // 렌더 결과
  String? renderedMp4Path;
  Duration renderedDuration = Duration.zero;
  int renderedSizeBytes = 0;

  // 진행률 (0~100)
  double renderProgress = 0;
  String renderStatus = '';

  // 유튜브 메타
  String videoTitle = '';
  String videoDescription = '';
  List<String> tags = [];
  String visibility = 'public'; // public / unlisted / private

  bool get hasAllInputs => mp4Path != null && jsonPath != null;

  void setMp4(String path, {Duration? duration}) {
    mp4Path = path;
    if (duration != null) audioDuration = duration;
    notifyListeners();
  }

  /// JSON 파일을 읽어 title + lyrics 파싱.
  /// 실패해도 jsonPath는 설정 (서버가 최종 검증).
  Future<void> setJsonFromFile(String path) async {
    jsonPath = path;
    try {
      final raw = await File(path).readAsString();
      final obj = jsonDecode(raw) as Map<String, dynamic>;
      final title = (obj['title'] as String?)?.trim();
      final lyrics = obj['lyrics'] as String?;
      if (title != null && title.isNotEmpty) {
        songTitle = title;
        if (videoTitle.isEmpty) videoTitle = title;
      }
      lrcLines = lyrics != null ? LrcParser.parseLyrics(lyrics) : const [];
    } catch (_) {
      lrcLines = const [];
    }
    notifyListeners();
  }

  void updateRender({double? progress, String? status}) {
    if (progress != null) renderProgress = progress;
    if (status != null) renderStatus = status;
    notifyListeners();
  }

  void setRenderedMp4(String path, {Duration? duration, int? sizeBytes}) {
    renderedMp4Path = path;
    if (duration != null) renderedDuration = duration;
    if (sizeBytes != null) renderedSizeBytes = sizeBytes;
    notifyListeners();
  }

  void setUploadMeta({
    String? title,
    String? description,
    List<String>? tags,
    String? visibility,
  }) {
    if (title != null) videoTitle = title;
    if (description != null) videoDescription = description;
    if (tags != null) this.tags = tags;
    if (visibility != null) this.visibility = visibility;
    notifyListeners();
  }

  /// 표시용 — JSON 파일명 (확장자 제외).
  String get jsonName =>
      jsonPath == null ? '' : p.basenameWithoutExtension(jsonPath!);

  void reset() {
    mp4Path = null;
    jsonPath = null;
    songTitle = '오둥이의 하루';
    lrcLines = const [];
    audioDuration = null;
    renderedMp4Path = null;
    renderedDuration = Duration.zero;
    renderedSizeBytes = 0;
    renderProgress = 0;
    renderStatus = '';
    videoTitle = '';
    videoDescription = '';
    tags = [];
    notifyListeners();
  }
}
