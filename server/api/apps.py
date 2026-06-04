from django.apps import AppConfig


class ApiConfig(AppConfig):
    name = 'api'

    def ready(self):
        from django.db.models.signals import post_migrate
        from django.contrib.auth.management import create_permissions
        from django.contrib.contenttypes.management import create_contenttypes

        # Disconnect signals that crash on django-mongodb-backend due to AutoField incompatibility
        post_migrate.disconnect(
            create_permissions,
            dispatch_uid="django.contrib.auth.management.create_permissions"
        )
        post_migrate.disconnect(create_contenttypes)

        # Patch DRF to properly handle MongoDB ObjectIds
        from rest_framework.serializers import ModelSerializer
        from rest_framework import serializers
        from rest_framework.utils.encoders import JSONEncoder
        from django_mongodb_backend.fields import ObjectIdAutoField
        from bson import ObjectId

        # 1. Map ObjectIdAutoField to CharField so it doesn't get converted to int() and crash
        ModelSerializer.serializer_field_mapping[ObjectIdAutoField] = serializers.CharField

        # 2. Patch JSONEncoder to serialize ObjectId from foreign keys natively
        original_default = JSONEncoder.default
        def custom_default(self, obj):
            if isinstance(obj, ObjectId):
                return str(obj)
            return original_default(self, obj)
        JSONEncoder.default = custom_default
