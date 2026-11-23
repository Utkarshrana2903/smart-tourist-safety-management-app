import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/main.dart';

void main() {
  testWidgets('MoDoNER app starts successfully', (WidgetTester tester) async {
    await tester.pumpWidget(const MoDoNERApp());

    expect(find.text('MoDoNER'), findsOneWidget);
  });
}
