/// 앱 전역 설정.
///
/// 렌더 서버는 사장님 PC에서 `node server/index.mjs` 로 띄움.
/// 폰과 PC가 같은 wifi에 있어야 접근 가능.
///
/// PC IP가 바뀌면(공유기 DHCP) 이 값만 수정하면 됨.
/// 확인: PC에서 `ipconfig` → Wi-Fi IPv4 주소.
class AppConfig {
  /// 렌더 서버 base URL (포트 4000).
  static const String serverBaseUrl = 'http://192.168.45.24:4000';

  /// status 폴링 간격.
  static const Duration pollInterval = Duration(seconds: 2);

  /// 렌더 전체 타임아웃 (긴 곡 + 인코딩 여유).
  static const Duration renderTimeout = Duration(minutes: 20);
}
