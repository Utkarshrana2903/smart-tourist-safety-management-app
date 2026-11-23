class UserModel {
  final int id;
  final String name;
  final String phone;
  final String? email;
  final DateTime? dateOfBirth;
  final String kycStatus;

  UserModel({
    required this.id,
    required this.name,
    required this.phone,
    this.email,
    this.dateOfBirth,
    required this.kycStatus,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json['id'] as int,
      name: json['name'] as String,
      phone: json['phone'] as String,
      email: json['email'] as String?,
      dateOfBirth: json['date_of_birth'] == null
          ? null
          : DateTime.parse(json['date_of_birth'] as String),
      kycStatus: json['kyc_status'] as String,
    );
  }
}