import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:path/path.dart' as p;
import '../services/project_state.dart';
import '../services/youtube_uploader.dart';
import '../theme.dart';
import '../widgets/nav_shell.dart';

/// 3페이지 — 유튜브 업로드.
/// 디자인: 상단 비디오 미리보기 카드 + 파일 정보(형식·크기·해상도·FPS) +
///        AI 인코딩 진행률 + 제목/설명/태그/공개상태 폼
class UploadScreen extends StatefulWidget {
  const UploadScreen({super.key});

  @override
  State<UploadScreen> createState() => _UploadScreenState();
}

class _UploadScreenState extends State<UploadScreen> {
  final _titleCtl = TextEditingController();
  final _descCtl = TextEditingController();
  final _tagCtl = TextEditingController();
  bool _uploading = false;
  double _uploadProgress = 0;
  String _uploadStatus = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final s = context.read<ProjectState>();
      if (s.videoTitle.isEmpty) {
        s.setUploadMeta(title: s.songTitle);
      }
      _titleCtl.text = s.videoTitle;
      _descCtl.text = s.videoDescription;
    });
  }

  @override
  void dispose() {
    _titleCtl.dispose();
    _descCtl.dispose();
    _tagCtl.dispose();
    super.dispose();
  }

  Future<void> _upload() async {
    final state = context.read<ProjectState>();
    state.setUploadMeta(
      title: _titleCtl.text.trim(),
      description: _descCtl.text.trim(),
    );
    setState(() {
      _uploading = true;
      _uploadProgress = 0;
      _uploadStatus = '준비 중...';
    });
    try {
      final url = await YouTubeUploader.upload(
        state,
        onProgress: (pct, status) {
          if (!mounted) return;
          setState(() {
            _uploadProgress = pct;
            _uploadStatus = status;
          });
        },
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('✅ 업로드 완료: $url'),
          duration: const Duration(seconds: 8),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('❌ 업로드 실패: $e')),
      );
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<ProjectState>();
    final mp4 = state.renderedMp4Path;
    final hasVideo = mp4 != null;
    return Column(
      children: [
        _appBar(),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              /* 상단 미리보기 — 2페이지에서 만든 mp4가 자동 표시 */
              _previewCard(state, hasVideo),
              const SizedBox(height: 16),
              /* 파일 정보 */
              _fileInfoCard(state, hasVideo),
              const SizedBox(height: 16),
              /* 인코딩 상태 (페이지2에서 렌더 완료된 mp4) */
              _encodingProgressCard(hasVideo),
              const SizedBox(height: 20),
              /* 제목 */
              _label('동영상 제목 (필수)'),
              const SizedBox(height: 8),
              _textField(_titleCtl, hint: '제목 입력', maxLength: 100),
              const SizedBox(height: 20),
              _label('설명'),
              const SizedBox(height: 8),
              _textField(_descCtl, hint: '설명 입력', maxLines: 5, maxLength: 5000),
              const SizedBox(height: 20),
              _label('태그'),
              const SizedBox(height: 8),
              _tagField(state),
              const SizedBox(height: 20),
              _label('공개 상태'),
              const SizedBox(height: 8),
              _visibilityRow(state),
              const SizedBox(height: 28),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: hasVideo && !_uploading ? _upload : null,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.cloud_upload, size: 20),
                      const SizedBox(width: 10),
                      Text(_uploading ? '업로드 중...' : '유튜브에 업로드'),
                    ],
                  ),
                ),
              ),
              if (_uploading) ...[
                const SizedBox(height: 16),
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: LinearProgressIndicator(
                    value: _uploadProgress / 100,
                    minHeight: 8,
                    backgroundColor: AppColors.surfaceAlt,
                    color: AppColors.accent,
                  ),
                ),
                const SizedBox(height: 8),
                Text('${_uploadProgress.toInt()}% · $_uploadStatus',
                  style: const TextStyle(color: AppColors.textDim, fontSize: 12),
                ),
              ],
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
            onPressed: () => NavShell.jumpTo(context, 1),
            icon: const Icon(Icons.arrow_back, color: AppColors.textPrimary),
          ),
          const Text('유튜브 업로드',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
          const Spacer(),
          IconButton(
            onPressed: () {},
            icon: const Icon(Icons.notifications_outlined, color: AppColors.textDim),
          ),
          Container(
            width: 32, height: 32,
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

  Widget _previewCard(ProjectState state, bool hasVideo) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.stroke),
      ),
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          /* 16:9 썸네일 placeholder (실제 영상 썸네일은 렌더된 mp4 — 폰에선 아이콘) */
          Container(
            width: 120, height: 80,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              color: AppColors.surfaceAlt,
            ),
            alignment: Alignment.center,
            child: Stack(
              alignment: Alignment.center,
              children: [
                Icon(
                  hasVideo ? Icons.movie : Icons.movie_outlined,
                  color: hasVideo ? AppColors.accentSoft : AppColors.textFaint,
                  size: 28,
                ),
                Positioned(
                  right: 4, bottom: 4,
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.75),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(_formatDuration(state.audioDuration),
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.w600)),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  hasVideo
                      ? p.basename(state.renderedMp4Path!)
                      : '아직 렌더된 영상이 없습니다',
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: AppColors.textPrimary, fontSize: 14, fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 6),
                Text(state.songTitle,
                  maxLines: 2, overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: AppColors.textDim, fontSize: 12, height: 1.4),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _fileInfoCard(ProjectState state, bool hasVideo) {
    String fileSize;
    if (hasVideo && state.renderedSizeBytes > 0) {
      final mb = state.renderedSizeBytes / (1024 * 1024);
      fileSize = mb > 1024
          ? '${(mb / 1024).toStringAsFixed(1)} GB'
          : '${mb.toStringAsFixed(1)} MB';
    } else {
      fileSize = '-';
    }
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.stroke),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(child: _infoCell('파일 형식', 'MP4 (H.264)')),
              Expanded(child: _infoCell('파일 크기', fileSize)),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(child: _infoCell('해상도', '1920×1080')),
              Expanded(child: _infoCell('프레임 속도', '60 fps')),
            ],
          ),
        ],
      ),
    );
  }

  Widget _infoCell(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: AppColors.textDim, fontSize: 11.5)),
        const SizedBox(height: 6),
        Text(value, style: const TextStyle(
          color: AppColors.accentSoft, fontSize: 16, fontWeight: FontWeight.w800,
        )),
      ],
    );
  }

  Widget _encodingProgressCard(bool ready) {
    final value = ready ? 1.0 : 0.0;
    final pct = (value * 100).toInt();
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.stroke),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          Row(
            children: [
              Text(ready ? '렌더 완료 — 업로드 준비됨' : '렌더 대기 중',
                style: const TextStyle(color: AppColors.textPrimary, fontSize: 13, fontWeight: FontWeight.w600),
              ),
              const Spacer(),
              Text('$pct%', style: const TextStyle(
                color: AppColors.accentSoft, fontSize: 14, fontWeight: FontWeight.w800,
              )),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: value,
              minHeight: 6,
              backgroundColor: AppColors.surfaceAlt,
              color: AppColors.blue,
            ),
          ),
        ],
      ),
    );
  }

  Widget _label(String t) => Text(t,
    style: const TextStyle(color: AppColors.textPrimary, fontSize: 13.5, fontWeight: FontWeight.w600));

  Widget _textField(TextEditingController c, {String? hint, int maxLines = 1, int? maxLength}) {
    return TextField(
      controller: c,
      maxLines: maxLines,
      maxLength: maxLength,
      style: const TextStyle(color: AppColors.textPrimary, fontSize: 14),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: AppColors.textFaint),
        filled: true,
        fillColor: AppColors.surface,
        contentPadding: const EdgeInsets.all(14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.stroke),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.stroke),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: AppColors.accentSoft.withOpacity(0.5), width: 1.5),
        ),
        counterStyle: const TextStyle(color: AppColors.textFaint, fontSize: 10),
      ),
    );
  }

  Widget _tagField(ProjectState state) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.stroke),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      child: Wrap(
        spacing: 6, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          for (final t in state.tags)
            _tagChip(t, () {
              state.setUploadMeta(tags: List.of(state.tags)..remove(t));
            }),
          SizedBox(
            width: 140,
            child: TextField(
              controller: _tagCtl,
              style: const TextStyle(color: AppColors.textPrimary, fontSize: 13),
              decoration: const InputDecoration(
                hintText: '태그 추가...',
                hintStyle: TextStyle(color: AppColors.textFaint, fontSize: 13),
                border: InputBorder.none,
                isDense: true,
              ),
              onSubmitted: (v) {
                final t = v.trim();
                if (t.isEmpty) return;
                final newList = List.of(state.tags);
                if (!newList.contains(t)) newList.add(t);
                state.setUploadMeta(tags: newList);
                _tagCtl.clear();
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _tagChip(String label, VoidCallback onRemove) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.surfaceAlt,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('#$label', style: const TextStyle(color: AppColors.textPrimary, fontSize: 12.5)),
          const SizedBox(width: 4),
          GestureDetector(
            onTap: onRemove,
            child: const Icon(Icons.close, size: 14, color: AppColors.textDim),
          ),
        ],
      ),
    );
  }

  Widget _visibilityRow(ProjectState state) {
    final items = [
      (key: 'public', icon: Icons.public, label: '공개'),
      (key: 'unlisted', icon: Icons.link, label: '일부 공개'),
      (key: 'private', icon: Icons.lock, label: '비공개'),
    ];
    return Row(
      children: [
        for (final it in items) ...[
          Expanded(
            child: GestureDetector(
              onTap: () => state.setUploadMeta(visibility: it.key),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 16),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: state.visibility == it.key
                        ? AppColors.accentSoft.withOpacity(0.7)
                        : AppColors.stroke,
                    width: state.visibility == it.key ? 1.6 : 1,
                  ),
                ),
                child: Column(
                  children: [
                    Icon(it.icon,
                      color: state.visibility == it.key ? AppColors.accentSoft : AppColors.textDim,
                      size: 22,
                    ),
                    const SizedBox(height: 8),
                    Text(it.label, style: const TextStyle(color: AppColors.textPrimary, fontSize: 12.5)),
                  ],
                ),
              ),
            ),
          ),
          if (it != items.last) const SizedBox(width: 10),
        ],
      ],
    );
  }

  String _formatDuration(Duration? d) {
    if (d == null) return '0:00';
    final m = d.inMinutes;
    final s = d.inSeconds % 60;
    return '$m:${s.toString().padLeft(2, '0')}';
  }
}
