import 'dart:async';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:just_audio/just_audio.dart';
import 'package:provider/provider.dart';
import 'package:path/path.dart' as p;
import '../models/lrc_line.dart';
import '../services/project_state.dart';
import '../services/lrc_parser.dart';
import '../services/video_renderer.dart';
import '../theme.dart';
import '../widgets/nav_shell.dart';

/// 2페이지 — 리모션 렌더링.
/// 입력: 사장님이 첨부하는 **mp4 + JSON** 두 파일.
///  - mp4  : 오디오 소스 (미리보기 재생) + 서버가 첫 프레임을 1:1 이미지로 추출
///  - JSON : title + lyrics (미리보기 가사 동기화)
/// "렌더링 시작" → PC Remotion 서버에 위임 → 완료 시 페이지3로.
class RenderScreen extends StatefulWidget {
  const RenderScreen({super.key});

  @override
  State<RenderScreen> createState() => _RenderScreenState();
}

class _RenderScreenState extends State<RenderScreen> {
  final _audioPlayer = AudioPlayer();
  StreamSubscription<Duration>? _positionSub;
  Duration _position = Duration.zero;
  bool _isRendering = false;

  @override
  void dispose() {
    _positionSub?.cancel();
    _audioPlayer.dispose();
    super.dispose();
  }

  Future<void> _pickMp4() async {
    final res = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['mp4'],
      allowMultiple: false,
    );
    if (res == null || res.files.isEmpty) return;
    final path = res.files.first.path!;
    /* just_audio로 mp4의 오디오 트랙 로드 + 길이 측정 (미리보기 재생용) */
    try {
      await _audioPlayer.setFilePath(path);
      final duration = _audioPlayer.duration;
      if (!mounted) return;
      context.read<ProjectState>().setMp4(path, duration: duration);
    } catch (_) {
      if (!mounted) return;
      context.read<ProjectState>().setMp4(path);
    }
    _positionSub ??= _audioPlayer.positionStream.listen((pos) {
      if (mounted) setState(() => _position = pos);
    });
  }

  Future<void> _pickJson() async {
    final res = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['json'],
      allowMultiple: false,
    );
    if (res == null || res.files.isEmpty) return;
    await context.read<ProjectState>().setJsonFromFile(res.files.first.path!);
  }

  Future<void> _playPause() async {
    if (_audioPlayer.playing) {
      await _audioPlayer.pause();
    } else {
      await _audioPlayer.play();
    }
    if (mounted) setState(() {});
  }

  Future<void> _startRender() async {
    final state = context.read<ProjectState>();
    if (!state.hasAllInputs) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('mp4와 JSON 두 파일을 모두 선택해주세요.')),
      );
      return;
    }
    setState(() => _isRendering = true);
    state.updateRender(progress: 0, status: '시작...');
    try {
      final outPath = await VideoRenderer.render(
        state,
        onProgress: (pct, status) {
          state.updateRender(progress: pct, status: status);
        },
      );
      state.setRenderedMp4(
        outPath,
        duration: state.audioDuration,
        sizeBytes: 0,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('✅ 렌더 완료: ${p.basename(outPath)}')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('❌ 렌더 실패: $e')),
      );
    } finally {
      if (mounted) setState(() => _isRendering = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<ProjectState>();
    final progress = state.renderProgress.clamp(0, 100).toDouble();
    final canUpload = progress >= 100 && state.renderedMp4Path != null;
    return Column(
      children: [
        _appBar(),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              _previewCard(state),
              const SizedBox(height: 16),
              _progressCard(state),
              const SizedBox(height: 16),
              _assetsCard(state),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: canUpload
                      ? () {
                          context.read<ProjectState>().setUploadMeta(
                                title: state.songTitle,
                              );
                          NavShell.jumpTo(context, 2);
                        }
                      : (state.hasAllInputs && !_isRendering
                          ? _startRender
                          : null),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: canUpload
                        ? AppColors.accent
                        : (state.hasAllInputs
                            ? AppColors.blue
                            : AppColors.surfaceAlt),
                    foregroundColor:
                        canUpload ? Colors.white : AppColors.textPrimary,
                    padding: const EdgeInsets.symmetric(vertical: 18),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(canUpload ? Icons.cloud_upload : Icons.movie_creation,
                          size: 20),
                      const SizedBox(width: 10),
                      Text(canUpload
                          ? '유튜브 업로드 진행하기'
                          : (_isRendering ? '렌더링 중...' : '렌더링 시작')),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Center(
                child: Text(
                  '내보내기 프로세스가 100%에 도달하면 버튼이 자동으로 활성화됩니다.',
                  style: TextStyle(color: AppColors.textFaint, fontSize: 11.5),
                  textAlign: TextAlign.center,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _appBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 16, 8),
      child: Row(
        children: [
          IconButton(
            onPressed: () => NavShell.jumpTo(context, 0),
            icon: const Icon(Icons.arrow_back, color: AppColors.textPrimary),
          ),
          const Text('리모션 렌더링',
              style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary)),
          const Spacer(),
          IconButton(
            onPressed: () {},
            icon: const Icon(Icons.notifications_outlined,
                color: AppColors.textDim),
          ),
          Container(
            width: 32,
            height: 32,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              color: AppColors.surfaceAlt,
            ),
            child: const Icon(Icons.person, color: AppColors.textDim, size: 18),
          ),
        ],
      ),
    );
  }

  /// 16:9 미리보기 — 좌측 mp4 placeholder + 우측 LRC 가사 스크롤 + 하단 타이틀.
  /// (좌측 1:1 이미지는 mp4 첫 프레임이라 서버 렌더 시 합성됨 — 폰 미리보기는 placeholder)
  Widget _previewCard(ProjectState state) {
    final activeIdx = LrcParser.activeIndex(state.lrcLines, _position);
    return AspectRatio(
      aspectRatio: 16 / 9,
      child: Container(
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [AppColors.surfaceAlt, AppColors.bg],
          ),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.stroke),
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          fit: StackFit.expand,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 56),
              child: Row(
                children: [
                  /* 좌측 1:1 placeholder — 실제 이미지는 서버가 mp4 첫 프레임으로 합성 */
                  AspectRatio(
                    aspectRatio: 1,
                    child: Container(
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppColors.stroke),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            state.mp4Path != null
                                ? Icons.movie
                                : Icons.movie_outlined,
                            color: state.mp4Path != null
                                ? AppColors.accentSoft
                                : AppColors.textFaint,
                            size: 34,
                          ),
                          const SizedBox(height: 6),
                          Padding(
                            padding:
                                const EdgeInsets.symmetric(horizontal: 6),
                            child: Text(
                              state.mp4Path != null
                                  ? '첫 프레임\n자동 합성'
                                  : 'mp4 없음',
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                  color: AppColors.textFaint, fontSize: 9.5),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: state.lrcLines.isEmpty
                        ? const Center(
                            child: Text('JSON 파일을 첨부하세요',
                                style: TextStyle(
                                    color: AppColors.textFaint,
                                    fontSize: 12)),
                          )
                        : _LyricsView(
                            lines: state.lrcLines, activeIndex: activeIdx),
                  ),
                ],
              ),
            ),
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.bottomCenter,
                    end: Alignment.topCenter,
                    colors: [
                      AppColors.bg.withOpacity(0.85),
                      AppColors.bg.withOpacity(0),
                    ],
                  ),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(state.songTitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                          )),
                    ),
                    GestureDetector(
                      onTap: state.mp4Path == null ? null : _playPause,
                      child: Icon(
                        _audioPlayer.playing
                            ? Icons.pause_circle
                            : Icons.play_circle,
                        color: state.mp4Path == null
                            ? AppColors.textFaint
                            : AppColors.accentSoft,
                        size: 26,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: LinearProgressIndicator(
                value: state.audioDuration == null ||
                        state.audioDuration!.inMilliseconds == 0
                    ? 0
                    : _position.inMilliseconds /
                        state.audioDuration!.inMilliseconds,
                minHeight: 2,
                backgroundColor: AppColors.surfaceAlt,
                color: AppColors.accentSoft,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _progressCard(ProjectState state) {
    final pct = state.renderProgress.toInt();
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.stroke),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Spacer(),
              Text('$pct%',
                  style: const TextStyle(
                    color: AppColors.accentSoft,
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                  )),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: LinearProgressIndicator(
              value: state.renderProgress / 100,
              minHeight: 8,
              backgroundColor: AppColors.surfaceAlt,
              color: AppColors.blue,
            ),
          ),
          const SizedBox(height: 10),
          Text(state.renderStatus.isEmpty ? '대기 중' : state.renderStatus,
              style: const TextStyle(color: AppColors.textDim, fontSize: 12.5)),
          const SizedBox(height: 12),
          Row(
            children: const [
              _InfoChip(label: '1080p'),
              SizedBox(width: 12),
              _InfoChip(label: '30fps'),
              SizedBox(width: 12),
              _InfoChip(label: 'H.264'),
            ],
          ),
        ],
      ),
    );
  }

  Widget _assetsCard(ProjectState state) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.stroke),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('프로젝트 에셋',
              style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary)),
          const SizedBox(height: 14),
          _AssetTile(
            icon: Icons.movie_outlined,
            title: state.mp4Path == null
                ? 'mp4 선택'
                : p.basename(state.mp4Path!),
            sub: state.mp4Path == null
                ? '오디오 + 첫 프레임 이미지'
                : '${_formatDuration(state.audioDuration)} · mp4',
            onTap: _pickMp4,
            selected: state.mp4Path != null,
          ),
          const SizedBox(height: 8),
          _AssetTile(
            icon: Icons.data_object,
            title: state.jsonPath == null
                ? 'JSON 선택'
                : p.basename(state.jsonPath!),
            sub: state.jsonPath == null
                ? 'title + 가사(lyrics)'
                : '${state.lrcLines.length} Lines · ${state.songTitle}',
            onTap: _pickJson,
            selected: state.jsonPath != null,
          ),
        ],
      ),
    );
  }

  String _formatDuration(Duration? d) {
    if (d == null) return '-:--';
    final m = d.inMinutes;
    final s = d.inSeconds % 60;
    return '$m:${s.toString().padLeft(2, '0')}';
  }
}

class _LyricsView extends StatefulWidget {
  final List<LrcLine> lines;
  final int activeIndex;
  const _LyricsView({required this.lines, required this.activeIndex});

  @override
  State<_LyricsView> createState() => _LyricsViewState();
}

class _LyricsViewState extends State<_LyricsView> {
  final _controller = ScrollController();

  @override
  void didUpdateWidget(covariant _LyricsView old) {
    super.didUpdateWidget(old);
    if (widget.activeIndex >= 0 && widget.activeIndex != old.activeIndex) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!_controller.hasClients) return;
        final target = (widget.activeIndex * 36.0 - 40).clamp(
          0.0,
          _controller.position.maxScrollExtent,
        );
        _controller.animateTo(target,
            duration: const Duration(milliseconds: 350),
            curve: Curves.easeOut);
      });
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ShaderMask(
      shaderCallback: (rect) {
        return const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Colors.transparent,
            Colors.white,
            Colors.white,
            Colors.transparent
          ],
          stops: [0, 0.12, 0.88, 1],
        ).createShader(rect);
      },
      blendMode: BlendMode.dstIn,
      child: ListView.builder(
        controller: _controller,
        itemCount: widget.lines.length,
        itemBuilder: (ctx, i) {
          final isActive = i == widget.activeIndex;
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Text(
              widget.lines[i].text,
              style: TextStyle(
                fontSize: isActive ? 14 : 12,
                color: isActive ? AppColors.accentSoft : AppColors.textFaint,
                fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
                height: 1.3,
              ),
            ),
          );
        },
      ),
    );
  }
}

class _AssetTile extends StatelessWidget {
  final IconData icon;
  final String title, sub;
  final bool selected;
  final VoidCallback onTap;
  const _AssetTile({
    required this.icon,
    required this.title,
    required this.sub,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: AppColors.surfaceAlt,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected
                ? AppColors.accentSoft.withOpacity(0.4)
                : Colors.transparent,
          ),
        ),
        child: Row(
          children: [
            Icon(icon, color: AppColors.textPrimary, size: 22),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: AppColors.textPrimary,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      )),
                  const SizedBox(height: 2),
                  Text(sub,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          color: AppColors.textDim, fontSize: 11.5)),
                ],
              ),
            ),
            Icon(
              selected ? Icons.check_circle : Icons.add_circle_outline,
              color: selected ? AppColors.accentSoft : AppColors.textFaint,
              size: 20,
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoChip extends StatelessWidget {
  final String label;
  const _InfoChip({required this.label});
  @override
  Widget build(BuildContext context) {
    return Text(label,
        style: const TextStyle(
            color: AppColors.textPrimary,
            fontSize: 12,
            fontWeight: FontWeight.w600));
  }
}
