#include <iostream>

/* run this program using the console pauser or add your own getch, system("pause") or input loop */
using namespace std;

int a, b = 5;

int main() {
	bool my_flag;
	a = 7;
	
	my_flag = false;
	
	cout << "a = " << a << endl;
	cout << "b = " << b << endl;
	cout << "flag = " << my_flag << endl;
	
	my_flag = true;
	cout << "a + b = " << a + b << endl;
	cout << "b - a = " << b - a << endl;
	cout << "flag = " << my_flag << endl;
	
	unsigned int positive;
	positive = b - a;
	cout << "b - a (unsigned) is " << positive << endl;
	
	return 0;
}
