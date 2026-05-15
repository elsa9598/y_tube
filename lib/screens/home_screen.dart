import 'package:flutter/material.dart';
import '../theme.dart';
import '../widgets/nav_shell.dart';

/// 1페이지 — 홈.
/// 스크린샷 디자인: 오둥이 하루 / AI 자동 생성 / Cartoon-Music 큰 헤더 /
/// 리모션 렌더링 빨간 CTA / STEP 02·03 카드 안내
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(child: _topBar()),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          sliver: SliverList.list(
            children: [
              const SizedBox(height: 12),
              Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: AppColors.stroke),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.flash_on, size: 14, color: AppColors.textDim),
                      SizedBox(width: 6),
                      Text('AI 자동 생성', style: TextStyle(
                        color: AppColors.textDim, fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                      )),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Center(
                child: Text('Cartoon-Music',
                  style: Theme.of(context).textTheme.headlineLarge?.copyWith(fontSize: 38),
                ),
              ),
              const SizedBox(height: 14),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Text(
                  '이미지, 음악, 가사만 준비하세요. 리모션이 고퀄리티 영상을 만들어드립니다. '
                  '창작의 즐거움에만 집중할 수 있는 새로운 워크플로우를 경험하세요.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: AppColors.textDim, fontSize: 13.5, height: 1.6,
                  ),
                ),
              ),
              const SizedBox(height: 28),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => NavShell.jumpTo(context, 1),
                  child: const Text('리모션 렌더링'),
                ),
              ),
              const SizedBox(height: 36),
              Divider(color: AppColors.stroke.withOpacity(0.6), height: 1),
              const SizedBox(height: 28),
              _StepCard(
                step: '02',
                icon: Icons.android,
                iconBg: const Color(0xFF1F2A4D),
                iconColor: const Color(0xFF6B8AFF),
                title: '리모션 렌더링',
                body: '준비된 에셋을 바탕으로 AI가 박자와 분위기에 맞춘 비주얼을 실시간으로 합성합니다.',
                progress: 0.5,
                onTap: () => NavShell.jumpTo(context, 1),
              ),
              const SizedBox(height: 16),
              _StepCard(
                step: '03',
                icon: Icons.upload_file,
                iconBg: const Color(0xFF3A1F1B),
                iconColor: const Color(0xFFFB7866),
                title: '유튜브 업로드',
                body: '완성된 고화질 영상을 원클릭으로 내 채널에 공유하고 전 세계와 소통하세요.',
                badges: const ['4K', '60', '4K 60fps 지원'],
                onTap: () => NavShell.jumpTo(context, 2),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _topBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
      child: Row(
        children: [
          Container(
            width: 38, height: 38,
            decoration: BoxDecoration(
              color: AppColors.accent,
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.movie, color: Colors.white, size: 22),
          ),
          const SizedBox(width: 12),
          const Text('오둥이 하루',
            style: TextStyle(
              fontSize: 19, fontWeight: FontWeight.w800,
              color: AppColors.textPrimary,
            ),
          ),
          const Spacer(),
          IconButton(
            onPressed: () {},
            icon: const Icon(Icons.notifications_outlined, color: AppColors.textDim),
          ),
          const SizedBox(width: 4),
          Container(
            width: 36, height: 36,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              color: AppColors.surfaceAlt,
            ),
            child: const Icon(Icons.person, color: AppColors.textDim, size: 22),
          ),
        ],
      ),
    );
  }
}

class _StepCard extends StatelessWidget {
  final String step, title, body;
  final IconData icon;
  final Color iconBg, iconColor;
  final double? progress;
  final List<String>? badges;
  final VoidCallback onTap;

  const _StepCard({
    required this.step, required this.title, required this.body,
    required this.icon, required this.iconBg, required this.iconColor,
    this.progress, this.badges, required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppColors.stroke),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 56, height: 56,
              decoration: BoxDecoration(
                color: iconBg,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(icon, color: iconColor, size: 28),
            ),
            const SizedBox(height: 20),
            Text('STEP $step', style: Theme.of(context).textTheme.labelSmall),
            const SizedBox(height: 6),
            Text(title, style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 12),
            Text(body, style: const TextStyle(color: AppColors.textDim, fontSize: 13.5, height: 1.55)),
            if (progress != null) ...[
              const SizedBox(height: 16),
              ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: LinearProgressIndicator(
                  value: progress,
                  minHeight: 4,
                  backgroundColor: AppColors.surfaceAlt,
                  color: AppColors.blue,
                ),
              ),
            ],
            if (badges != null) ...[
              const SizedBox(height: 16),
              Row(
                children: [
                  for (var i = 0; i < badges!.length; i++) ...[
                    if (i > 0) const SizedBox(width: 8),
                    if (i < 2)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                        decoration: BoxDecoration(
                          color: AppColors.surfaceAlt,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(badges![i],
                          style: const TextStyle(color: AppColors.textPrimary, fontSize: 12, fontWeight: FontWeight.w700),
                        ),
                      )
                    else
                      Text(badges![i], style: const TextStyle(color: AppColors.textDim, fontSize: 12.5)),
                  ],
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
