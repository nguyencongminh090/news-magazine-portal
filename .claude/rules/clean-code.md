---
paths:
  - "src/**"
  - "client/**"
  - "server/**"
  - "scripts/**"
---
# Clean Code

Chuẩn đầy đủ (đọc tại chỗ, không copy): `$SKILLS_TREE/rules/coding-standards/items/code-writing.md` (cấu trúc, kiểu dữ liệu, lỗi, trùng lặp)
và `coding-style.md` (định dạng, comment, đặt tên); DB: `database.md`. Review/refactor: knowledge `cleancode-code-smells`, `cleancode-refactoring-triggers`.
Quy tắc project > chuẩn này. Tóm tắt các điểm hay vi phạm:
- Đọc code xung quanh + tìm helper sẵn có trước khi viết mới; match idiom/mật độ comment của file; thay đổi nhỏ nhất đủ giải quyết, không refactor "tiện tay".
- Một trách nhiệm/hàm (~40 dòng, ≤ 3 tham số, lồng ≤ 3), guard clause; file ~300 dòng; I/O ở rìa, logic thuần ở lõi.
- Không magic number/string, không biến toàn cục có thể đổi, không cờ boolean đổi hành vi, không `any` để lách lỗi.
- Validate ở biên, fail fast với message có ngữ cảnh, không nuốt lỗi, không fallback im lặng.
- Rule of three trước khi trừu tượng hoá; không dead/commented-out code, không debug log sót, không secret trong code.
