-- 결제수단 → 그룹 매핑 테이블 (BigQuery 콘솔에서 한 번 실행)
--
-- - 웹(Data Guide 화면 · 연말정산 카드 지출)과 Tableau 가 함께 쓰는 단일 기준표
-- - 실제 카드·통장 이름은 개인정보라 이 저장소(공개)에는 넣지 않음 → 값은 BigQuery 테이블에만 존재
-- - 그룹: Account(계좌) · Debit(체크카드) · Credit(신용카드) · Cash(현금성) · Etc(간편결제 등 구분 불가)
--   거래 원장에 있는데 이 표에 없는 결제수단은 웹에서 'Unmapped' 로 표시됨
--
-- 새 결제수단 추가 예 (추가 후 rttr-publish 를 실행하면 웹에 반영):
--   INSERT INTO `<프로젝트>.banksalad_prd.payment_method_map` (payment_method, pm_group, note, updated_at)
--   VALUES ('새 카드 이름', 'Credit', '메모', CURRENT_DATE('Asia/Seoul'));
--
-- 그룹 바꾸기 예:
--   UPDATE `<프로젝트>.banksalad_prd.payment_method_map`
--   SET pm_group = 'Debit', updated_at = CURRENT_DATE('Asia/Seoul') WHERE payment_method = '카드 이름';
CREATE TABLE IF NOT EXISTS `<프로젝트>.banksalad_prd.payment_method_map` (
  payment_method STRING NOT NULL OPTIONS (description = '가계부 payment_method 값 (앞뒤 공백 없이)'),
  pm_group       STRING NOT NULL OPTIONS (description = 'Account | Debit | Credit | Cash | Etc'),
  note           STRING          OPTIONS (description = '메모 (누구 카드인지, 해지 여부 등)'),
  updated_at     DATE            OPTIONS (description = '마지막 수정일')
)
OPTIONS (description = '결제수단 → 그룹 매핑 (rttr Data Guide · 연말정산 카드 지출 · Tableau 공용)');
